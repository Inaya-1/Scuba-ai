let lastSpoken = '';
let lastSpokenAt = 0;
let speaking = false;

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
  audio.addEventListener('ended', () => { URL.revokeObjectURL(url); speaking = false; });
  await audio.play();
}

function browserTTS(text: string): void {
  if (!('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95;
  utter.pitch = 1.0;
  utter.onend = () => { speaking = false; };
  speechSynthesis.speak(utter);
}

/**
 * Scoobi master TTS — speaks any agent's tts_text through ElevenLabs.
 * Urgent messages (critical safety) interrupt the dedup guard.
 */
export async function speakScoobi(ttsText: string | undefined, urgent = false): Promise<void> {
  if (!ttsText) return;

  // Skip if already speaking (unless urgent — urgent interrupts)
  if (speaking && !urgent) return;

  // Dedup guard: skip if same text spoken in last 10 seconds (urgent bypasses)
  const now = Date.now();
  if (!urgent && ttsText === lastSpoken && now - lastSpokenAt < 10_000) return;
  lastSpoken = ttsText;
  lastSpokenAt = now;
  speaking = true;

  try {
    await elevenLabsTTS(ttsText, urgent);
  } catch {
    browserTTS(ttsText);
  }
}

/** @deprecated Use speakScoobi instead */
export const speakSpecies = speakScoobi;
