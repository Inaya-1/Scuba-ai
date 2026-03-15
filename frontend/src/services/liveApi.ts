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
          systemInstruction: `You are Scuba.ai, a real-time AI dive buddy. You have two information sources:
1. Your own visual analysis of the live camera feed
2. Structured AGENT REPORTS from specialist subsystems (safety, bio, nav) injected as text messages

WHEN YOU RECEIVE AN AGENT REPORT:
- Triage it by priority. Critical safety alerts (priority 7+) must be spoken IMMEDIATELY.
- For bio species identifications, mention them conversationally: "Looks like a [name] — [one fact]."
- For navigation updates, only speak if the diver is off-course or reaching a waypoint.
- For routine low-priority info (priority 0-2), absorb silently — don't narrate every gauge reading unless it's unusual.
- NEVER read the JSON literally. Translate it into natural dive buddy speech.

VOICE BEHAVIOR:
- Keep spoken responses SHORT (1-2 sentences max).
- Use a calm, clear tone. The diver is underwater and needs concise info.
- For hazards, speak urgently: "WARNING: [hazard]. [action to take]."
- For species ID, be brief: "That's a [name]. [one safety/fun fact]."
- For gauge readings, only mention if values are concerning.

PRIORITIES:
1. SAFETY FIRST — always call out hazards immediately, interrupt anything else
2. Navigation corrections when off-course
3. Species ID when notable or requested
4. General scene description only if specifically asked

You are watching a live camera feed AND receiving structured intelligence from backend agents. Be the single unified voice the diver hears.`,
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

  /** Inject a structured agent report as context for the Live AI to triage */
  sendAgentReport(report: { agent: string; type: string; content: string; priority: number | string; metadata?: any }) {
    if (!this.session) return;
    const priorityNum = typeof report.priority === 'number' ? report.priority
      : report.priority === 'critical' ? 9
      : report.priority === 'high' ? 6
      : report.priority === 'medium' ? 3 : 1;

    const text = `AGENT REPORT [${report.agent.toUpperCase()}] priority=${priorityNum} type=${report.type}: ${report.content}${
      report.metadata ? ` | metadata: ${JSON.stringify(report.metadata)}` : ''
    }`;

    try {
      this.session.sendClientContent({
        turns: [{ role: "user", parts: [{ text }] }],
      });
    } catch (err) {
      console.error("[Live] Failed to send agent report:", err);
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
    this.nextPlayTime = 0;
    this.audioContext?.close().catch(() => {});
    this.audioContext = null;
  }

  // -- Audio playback for voice responses --
  private nextPlayTime = 0;

  async playAudioChunk(base64Pcm: string) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 24000 });
    }
    const ctx = this.audioContext;

    // Resume if suspended (browser autoplay policy)
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

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

    // Queue chunks sequentially to avoid overlap
    const startTime = Math.max(ctx.currentTime, this.nextPlayTime);
    source.start(startTime);
    this.nextPlayTime = startTime + buffer.duration;
  }
}

export const geminiLive = new GeminiLive();
