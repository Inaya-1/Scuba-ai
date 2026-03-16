let lastSpoken = '';
let lastSpokenAt = 0;

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
  audio.addEventListener('ended', () => URL.revokeObjectURL(url));
  await audio.play();
}

function browserTTS(text: string): void {
  if (!('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  utter.rate = 0.95;
  utter.pitch = 1.0;
  speechSynthesis.speak(utter);
}

export async function speakSpecies(ttsText: string | undefined, safetyLevel?: string): Promise<void> {
  if (!ttsText) return;

  // Dedup guard: skip if same text spoken in last 10 seconds
  const now = Date.now();
  if (ttsText === lastSpoken && now - lastSpokenAt < 10_000) return;
  lastSpoken = ttsText;
  lastSpokenAt = now;

  const urgent = safetyLevel === 'dangerous';

  try {
    await elevenLabsTTS(ttsText, urgent);
  } catch {
    browserTTS(ttsText);
  }
}
