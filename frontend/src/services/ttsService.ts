// ── Audio queue: only one utterance plays at a time ──
let playing = false;
const queue: { text: string; urgent: boolean }[] = [];

// ── Species dedup: track seen species by name + frame-change detection ──
const seenSpecies = new Map<string, number>(); // species name → timestamp
const SPECIES_DEDUP_MS = 60_000; // ignore same species for 60s
const MIN_BIO_GAP_MS = 5_000; // minimum 5s between any bio TTS (prevents rapid-fire re-ID)
const FRAME_CHANGE_THRESHOLD = 0.5; // 50% of cells must differ to count as scene change
let lastBioAt = 0;
let lastBioFrameHash: number[] | null = null; // frame hash when last bio ID happened
let currentFrameHash: number[] | null = null; // continuously updated from App.tsx

// ── General dedup: track recent utterance texts ──
const recentTexts = new Map<string, number>(); // normalized text → timestamp
const TEXT_DEDUP_MS = 20_000;

// ── Frame-change detection ──
/**
 * Compute a 4x4 luminance grid from a base64 JPEG. Returns 16 values (0-7).
 * Used to detect when the camera scene changes significantly.
 */
export function computeFrameHash(base64: string): Promise<number[]> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 4;
      canvas.height = 4;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve([]); return; }
      ctx.drawImage(img, 0, 0, 4, 4);
      const data = ctx.getImageData(0, 0, 4, 4).data;
      const hash: number[] = [];
      for (let i = 0; i < data.length; i += 4) {
        // Quantize luminance to 0-7 (3 bits) for noise tolerance
        const lum = Math.round((data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) / 32);
        hash.push(lum);
      }
      resolve(hash);
    };
    img.onerror = () => resolve([]);
    img.src = base64.startsWith('data:') ? base64 : `data:image/jpeg;base64,${base64}`;
  });
}

/** Update the current frame hash (called from App.tsx on each frame). */
export function setCurrentFrameHash(hash: number[]) {
  currentFrameHash = hash;
}

/** Compare two frame hashes. Returns fraction of cells that differ significantly (0-1). */
function frameHashDiff(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 1;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > 1) diff++; // Allow 1 quantization level of noise
  }
  return diff / a.length;
}

function normalizeForDedup(text: string): string {
  // Strip filler words and punctuation for comparison
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(wow|nice|look|at|those|that|thats|its|a|an|the|some|here|there|find|found|spot|spotted|see|seeing)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTextDuplicate(text: string): boolean {
  const now = Date.now();
  const norm = normalizeForDedup(text);
  if (!norm || norm.length < 5) return false; // Don't dedup very short texts

  // Clean old entries
  for (const [k, t] of recentTexts) {
    if (now - t > TEXT_DEDUP_MS) recentTexts.delete(k);
  }

  return recentTexts.has(norm);
}

function recordText(text: string) {
  recentTexts.set(normalizeForDedup(text), Date.now());
}

// ── ElevenLabs TTS ──
async function elevenLabsTTS(text: string, urgent: boolean): Promise<void> {
  const resp = await fetch('/api/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, urgent }),
  });
  if (!resp.ok) throw new Error(`TTS ${resp.status}`);
  const blob = await resp.blob();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  return new Promise((resolve) => {
    audio.addEventListener('ended', () => { URL.revokeObjectURL(url); resolve(); });
    audio.addEventListener('error', () => { URL.revokeObjectURL(url); resolve(); });
    audio.play().catch(() => resolve());
  });
}

// ── Browser fallback TTS ──
function browserTTS(text: string): Promise<void> {
  if (!('speechSynthesis' in window)) return Promise.resolve();
  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.95;
    utter.pitch = 1.0;
    utter.onend = () => resolve();
    utter.onerror = () => resolve();
    speechSynthesis.speak(utter);
  });
}

// ── Process queue: play one at a time ──
async function processQueue() {
  if (playing || queue.length === 0) return;
  playing = true;

  const item = queue.shift()!;
  try {
    await elevenLabsTTS(item.text, item.urgent);
  } catch {
    await browserTTS(item.text);
  }

  playing = false;
  processQueue();
}

/**
 * Scoobi master TTS — queues speech so utterances never overlap.
 * Urgent messages jump to front of queue.
 * Species dedup is handled by the caller via isSpeciesRecentlySeen/markSpeciesSeen.
 */
export async function speakScoobi(
  ttsText: string | undefined,
  urgent = false,
): Promise<void> {
  if (!ttsText) return;

  // General text dedup (urgent bypasses)
  if (!urgent && isTextDuplicate(ttsText)) return;
  recordText(ttsText);

  if (urgent) {
    queue.unshift({ text: ttsText, urgent: true });
  } else {
    if (queue.length >= 3) return;
    queue.push({ text: ttsText, urgent: false });
  }

  processQueue();
}

/**
 * Normalize a species name into its core words for fuzzy matching.
 * "Spotted Porcupine Fish" → ["fish", "porcupine"]  (sorted, no modifiers)
 * Also splits compound words: "porcupinefish" → ["fish", "porcupine"]
 */
function speciesWords(name: string): string[] {
  const MODIFIERS = new Set([
    'spotted', 'striped', 'banded', 'common', 'giant', 'dwarf', 'small', 'large',
    'blue', 'red', 'green', 'yellow', 'white', 'black', 'golden', 'orange', 'pink',
    'pacific', 'atlantic', 'indian', 'caribbean', 'hawaiian', 'mediterranean',
    'northern', 'southern', 'eastern', 'western', 'greater', 'lesser',
  ]);
  // Common compound suffixes in marine species names
  const COMPOUND_SUFFIXES = [
    'fish', 'shark', 'ray', 'eel', 'crab', 'squid', 'octopus',
    'whale', 'dolphin', 'turtle', 'snake', 'star', 'worm', 'jelly',
  ];

  let words = name.toLowerCase().trim()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/);

  // Split compound words: "porcupinefish" → "porcupine" + "fish"
  const expanded: string[] = [];
  for (const w of words) {
    let split = false;
    for (const suffix of COMPOUND_SUFFIXES) {
      if (w.length > suffix.length + 2 && w.endsWith(suffix)) {
        expanded.push(w.slice(0, -suffix.length));
        expanded.push(suffix);
        split = true;
        break;
      }
    }
    if (!split) expanded.push(w);
  }

  return expanded
    .filter(w => w.length > 1 && !MODIFIERS.has(w))
    .sort();
}

/**
 * Check if a species was recently identified (fuzzy + frame-aware cooldown).
 * Returns true if this species should be skipped.
 *
 * Logic:
 * - Absolute minimum gap (3s) always applies to prevent rapid-fire TTS.
 * - If the camera scene hasn't changed since the last bio ID, suppress new IDs
 *   (same scene = likely same fish still in frame).
 * - If the scene HAS changed, allow new species immediately (after the 3s minimum).
 * - Per-species 60s dedup always applies regardless of frame changes.
 */
export function isSpeciesRecentlySeen(speciesName: string): boolean {
  const now = Date.now();

  // Absolute minimum gap — always enforced
  if (now - lastBioAt < MIN_BIO_GAP_MS) return true;

  // Frame-aware cooldown: if scene hasn't changed, suppress (same fish still in frame)
  const sceneChanged = (() => {
    if (!lastBioFrameHash || !currentFrameHash || currentFrameHash.length === 0) return true;
    return frameHashDiff(lastBioFrameHash, currentFrameHash) >= FRAME_CHANGE_THRESHOLD;
  })();

  if (!sceneChanged) {
    // Scene looks the same — suppress all bio (same fish probably still in frame)
    return true;
  }

  // Scene changed — clear per-species dedup so fish can be re-identified on video loop
  // (the backend enforces consistent naming via prompt context)
  seenSpecies.clear();
  return false;
}

/**
 * Record a species as seen + snapshot the current frame for scene comparison.
 */
export function markSpeciesSeen(speciesName: string) {
  seenSpecies.set(speciesName.toLowerCase().trim(), Date.now());
  lastBioAt = Date.now();
  // Snapshot the frame so we can detect when the scene changes
  if (currentFrameHash && currentFrameHash.length > 0) {
    lastBioFrameHash = [...currentFrameHash];
  }
}

/** @deprecated Use speakScoobi instead */
export const speakSpecies = speakScoobi;
