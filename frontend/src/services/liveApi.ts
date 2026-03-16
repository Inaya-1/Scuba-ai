import { GoogleGenAI, Modality, Session, FunctionDeclaration } from "@google/genai";

// ── Voice-controllable setting functions ──
const SETTING_TOOLS: FunctionDeclaration[] = [
  {
    name: "toggle_mode",
    description: "Switch the dive mode between 'marine-biologist' (bio research mode with species cards and detailed analysis) and 'diver' (minimal HUD, safety-focused). Call this when the user asks to switch mode, change mode, go to diver mode, go to bio mode, etc.",
  },
  {
    name: "toggle_auto_identify",
    description: "Turn automatic fish/species identification on or off. When on, the AI continuously identifies marine life in the camera feed. Call when user says 'turn on/off fish ID', 'stop/start identifying fish', 'auto identify on/off', etc.",
  },
  {
    name: "toggle_agent_cards",
    description: "Show or hide the on-screen agent response cards (text overlays from safety, bio, and nav agents). Call when user says 'show/hide cards', 'show/hide text', 'toggle cards', etc.",
  },
  {
    name: "open_map",
    description: "Open the dive map upload interface so the diver can upload or view their dive site map. Call when user says 'open map', 'upload map', 'show map', etc.",
  },
  {
    name: "identify_now",
    description: "Trigger an immediate fish/species identification of what's currently visible in the camera. Call when user says 'what fish is that', 'identify this', 'what species', 'what am I looking at', etc.",
  },
  {
    name: "identify_pointed",
    description: "The diver is pointing at something in the camera frame. Trigger a species/object identification of whatever they are pointing at. Call this when you see a pointing hand or finger gesture in the video feed directed at a marine creature or object.",
  },
];

export type LiveCallbacks = {
  onTextResponse: (text: string) => void;
  onAudioData: (pcmBase64: string) => void;
  onError: (err: any) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onToolCall?: (name: string, args: Record<string, unknown>) => string;
};

export class GeminiLive {
  private ai: GoogleGenAI | null = null;
  private session: Session | null = null;
  private callbacks: LiveCallbacks | null = null;
  private audioContext: AudioContext | null = null;
  // Buffer streamed text chunks and emit once per turn
  private textBuffer = '';
  private transcriptBuffer = '';
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

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

      console.log("[Live] Connecting to Gemini Live API...");
      this.session = await this.ai.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-12-2025",
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
          responseModalities: [Modality.AUDIO],
          outputAudioTranscription: {},
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Zephyr" },
            },
          },
          tools: [{ functionDeclarations: SETTING_TOOLS }],
          systemInstruction: `You are Scoobi, the AI dive buddy for Scuba.ai. You receive live video and audio from the diver, plus structured AGENT REPORTS from backend systems.

IMPORTANT — OUTPUT RULES:
- You must NOT produce any audio or text output unless the diver speaks to you directly.
- Do NOT narrate, describe, or comment on anything you see in the camera.
- Do NOT repeat or read aloud agent reports. Other systems handle that via separate TTS.
- Do NOT make filler sounds, greetings, or acknowledgements unprompted.
- Produce ZERO output unless one of these happens:
  1. The diver asks you a question or gives a voice command.
  2. You need to execute a tool — briefly confirm in under 5 words.

AGENT REPORTS: Absorb all agent reports as context only. NEVER speak them aloud. Another system handles voice alerts.

POINTING GESTURE: If you see a pointing hand in the video, call identify_pointed. Say nothing yourself.

VOICE COMMANDS — use these tools when the diver asks:
- toggle_mode: Switch between marine-biologist and diver mode
- toggle_auto_identify: Turn auto fish ID on/off
- toggle_agent_cards: Show/hide text overlay cards
- open_map: Open the dive map
- identify_now: Identify what's in the camera
- identify_pointed: Identify what diver points at
After a tool call, confirm in under 5 words (e.g. "Done." or "Switched.").

VOICE STYLE: 1 sentence max. Calm, clear, concise.`,
        },
      });
    } catch (err) {
      console.error("[Live] Connection failed:", err);
      callbacks.onError(err);
    }
  }

  private handleMessage(msg: any) {
    // Handle tool calls from the Live API (voice-controlled settings)
    if (msg?.toolCall?.functionCalls) {
      const responses: Array<{ id: string; name: string; response: { result: string } }> = [];
      for (const fc of msg.toolCall.functionCalls) {
        console.log(`[Live] Tool call: ${fc.name}`, fc.args);
        const result = this.callbacks?.onToolCall?.(fc.name, fc.args || {}) ?? "done";
        responses.push({ id: fc.id, name: fc.name, response: { result } });
      }
      try {
        this.session?.sendToolResponse({ functionResponses: responses });
      } catch (err) {
        console.error("[Live] Failed to send tool response:", err);
      }
      return;
    }

    const sc = msg?.serverContent;
    if (!sc) return;

    // Accumulate transcription chunks (the text version of audio output)
    if (sc.outputTranscription?.text) {
      this.transcriptBuffer += sc.outputTranscription.text;
      this.scheduleFlush();
    }

    // Accumulate model turn text chunks + play audio immediately
    const parts = sc.modelTurn?.parts;
    if (parts) {
      for (const part of parts) {
        if (part.text) {
          this.textBuffer += part.text;
          this.scheduleFlush();
        }
        if (part.inlineData?.mimeType?.startsWith("audio/")) {
          this.callbacks?.onAudioData(part.inlineData.data);
        }
      }
    }

    // Turn complete — flush immediately
    if (sc.turnComplete) {
      this.flushText();
    }
  }

  private scheduleFlush() {
    // Debounce: flush after 800ms of no new chunks (fallback if turnComplete never fires)
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flushText(), 800);
  }

  private flushText() {
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }

    // Prefer transcript buffer (cleaner text from audio transcription)
    const text = (this.transcriptBuffer || this.textBuffer).trim();
    this.textBuffer = '';
    this.transcriptBuffer = '';

    if (text && !this.isSilenceText(text)) {
      this.callbacks?.onTextResponse(text);
    }
  }

  private isSilenceText(text: string): boolean {
    const t = text.toLowerCase().trim();
    if (!t || t === '...' || t === '…') return true;
    // Filter out any variation of "silence" or self-referential system prompt leaks
    if (/^silence\.?$/.test(t)) return true;
    if (t.includes('silence by default')) return true;
    if (t.includes('remaining silent')) return true;
    if (t.includes('i\'ll remain silent')) return true;
    if (t.includes('staying silent')) return true;
    if (t.includes('i will remain silent')) return true;
    if (t.includes('no narration')) return true;
    // Filter very short non-substantive responses
    if (t.length < 4 && !/\d/.test(t)) return true;
    return false;
  }

  sendFrame(base64: string) {
    if (!this.session) return;
    try {
      this.session.sendRealtimeInput({
        video: { data: base64, mimeType: "image/jpeg" },
      });
    } catch (err) {
      console.error("[Live] Failed to send frame:", err);
    }
  }

  sendAudio(base64Pcm: string) {
    if (!this.session) return;
    try {
      this.session.sendRealtimeInput({
        audio: { data: base64Pcm, mimeType: "audio/pcm;rate=16000" },
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
      // Use sendRealtimeInput (not sendClientContent) to avoid disrupting VAD
      this.session.sendRealtimeInput({ text });
    } catch (err) {
      console.error("[Live] Failed to send agent report:", err);
    }
  }

  sendText(text: string) {
    if (!this.session) return;
    try {
      this.session.sendRealtimeInput({ text });
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
    this.textBuffer = '';
    this.transcriptBuffer = '';
    if (this.flushTimer) { clearTimeout(this.flushTimer); this.flushTimer = null; }
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
