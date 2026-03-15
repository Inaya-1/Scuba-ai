import { GoogleGenAI, Modality, Session } from "@google/genai";

export type LiveCallbacks = {
  onTextResponse: (text: string) => void;
  onAudioData: (pcmBase64: string) => void;
  onError: (err: any) => void;
  onConnect: () => void;
  onDisconnect: () => void;
};

export class GeminiLive {
  private ai: GoogleGenAI | null = null;
  private session: Session | null = null;
  private callbacks: LiveCallbacks | null = null;
  private audioContext: AudioContext | null = null;

  get connected(): boolean {
    return this.session !== null;
  }

  async connect(callbacks: LiveCallbacks, accessCode?: string) {
    this.callbacks = callbacks;

    try {
      // Fetch API key from backend (gated by access code)
      const res = await fetch("/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: accessCode || "" }),
      });
      const data = await res.json();
      if (data.error || !data.apiKey || data.apiKey === "placeholder") {
        throw new Error(data.error || "Gemini API key not configured on backend");
      }

      this.ai = new GoogleGenAI({ apiKey: data.apiKey });

      this.session = await this.ai.live.connect({
        model: "gemini-2.5-flash-live-001",
        callbacks: {
          onopen: () => {
            console.log("[Live] Session opened");
            this.callbacks?.onConnect();
          },
          onmessage: (msg: any) => {
            this.handleMessage(msg);
          },
          onerror: (err: any) => {
            console.error("[Live] Error:", err);
            this.callbacks?.onError(err);
          },
          onclose: () => {
            console.log("[Live] Session closed");
            this.session = null;
            this.callbacks?.onDisconnect();
          },
        },
        config: {
          responseModalities: [Modality.AUDIO, Modality.TEXT],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Zephyr" },
            },
          },
          systemInstruction: `You are Scuba.ai, a real-time AI dive buddy monitoring a diver's camera feed.

VOICE BEHAVIOR:
- Keep spoken responses SHORT (1-2 sentences max).
- Use a calm, clear tone. The diver is underwater and needs concise info.
- For hazards, speak urgently: "WARNING: [hazard]. [action to take]."
- For species ID, be brief: "That's a [name]. [one safety/fun fact]."
- For gauge readings, just state the values: "Depth 18 meters, air 150 bar."

PRIORITIES:
1. SAFETY FIRST - always call out hazards immediately
2. Gauge readings when visible
3. Species ID when asked or when something notable appears
4. General scene description only if specifically asked

You are watching a live camera feed. Analyze what you see and respond via voice.`,
        },
      });
    } catch (err) {
      console.error("[Live] Connection failed:", err);
      callbacks.onError(err);
    }
  }

  private handleMessage(msg: any) {
    // Handle server content from the Live API
    const parts = msg?.serverContent?.modelTurn?.parts;
    if (!parts) return;

    for (const part of parts) {
      if (part.text) {
        this.callbacks?.onTextResponse(part.text);
      }
      if (part.inlineData?.mimeType?.startsWith("audio/")) {
        this.callbacks?.onAudioData(part.inlineData.data);
      }
    }
  }

  sendFrame(base64: string) {
    if (!this.session) return;
    try {
      this.session.sendRealtimeInput({
        media: { data: base64, mimeType: "image/jpeg" },
      });
    } catch (err) {
      console.error("[Live] Failed to send frame:", err);
    }
  }

  sendAudio(base64Pcm: string) {
    if (!this.session) return;
    try {
      this.session.sendRealtimeInput({
        media: { data: base64Pcm, mimeType: "audio/pcm;rate=16000" },
      });
    } catch (err) {
      console.error("[Live] Failed to send audio:", err);
    }
  }

  sendText(text: string) {
    if (!this.session) return;
    try {
      this.session.sendClientContent({
        turns: [{ role: "user", parts: [{ text }] }],
      });
    } catch (err) {
      console.error("[Live] Failed to send text:", err);
    }
  }

  disconnect() {
    try {
      this.session?.close();
    } catch {}
    this.session = null;
    this.ai = null;
  }

  // -- Audio playback for voice responses --
  async playAudioChunk(base64Pcm: string) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = this.audioContext;

    const raw = atob(base64Pcm);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);

    // Convert 16-bit PCM to float32
    const samples = new Float32Array(bytes.length / 2);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = view.getInt16(i * 2, true) / 32768;
    }

    const buffer = ctx.createBuffer(1, samples.length, 24000);
    buffer.getChannelData(0).set(samples);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start();
  }
}

export const geminiLive = new GeminiLive();
