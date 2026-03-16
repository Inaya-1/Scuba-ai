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
          systemInstruction: `You are Scuba.ai, a real-time AI dive buddy. You receive video frames from the diver's camera and audio from their microphone. You also receive structured AGENT REPORTS from backend specialist systems.

SILENCE BY DEFAULT:
- Do NOT narrate what you see in the camera unless the diver asks you to.
- Do NOT describe the scene, fish, coral, or surroundings unprompted.
- Do NOT make small talk or filler commentary.
- Stay SILENT unless one of these conditions is met:
  1. The diver speaks to you — respond to their question/request
  2. A CRITICAL safety alert arrives (priority 7+) — speak it immediately
  3. You just executed a tool — briefly confirm the action
  4. You detect a pointing gesture — call identify_pointed

WHEN YOU RECEIVE AN AGENT REPORT:
- Critical safety (priority 7+): speak IMMEDIATELY in 1 sentence.
- Everything else: absorb silently. Do NOT narrate agent reports unless the diver asks.

POINTING GESTURE DETECTION:
- If you see a hand/finger pointing at something in the video frame, call the identify_pointed tool.
- Do NOT describe what they're pointing at yourself — let the bio agent handle it.

VOICE COMMANDS — SETTINGS CONTROL:
You have tools to control the dive interface. When the diver asks to change a setting, USE THE TOOL — do not just talk about it.
- toggle_mode: Switch between marine-biologist and diver mode
- toggle_auto_identify: Turn automatic fish identification on/off
- toggle_agent_cards: Show/hide text overlay cards
- open_map: Open the dive map interface
- identify_now: Identify what's in the camera
- identify_pointed: Identify what the diver is pointing at
After calling a tool, confirm in under 5 words (e.g. "Done." or "Switched to diver mode.").

VOICE BEHAVIOR:
- Keep responses SHORT (1 sentence max).
- Calm, clear tone.
- For hazards: "Warning: [hazard]. [action]."

You are the single voice the diver hears. Prioritize silence and brevity.`,
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
      // Send tool responses back so Gemini can confirm the action
      try {
        this.session?.sendToolResponse({ functionResponses: responses });
      } catch (err) {
        console.error("[Live] Failed to send tool response:", err);
      }
      return;
    }

    // Handle server content from the Live API
    const sc = msg?.serverContent;
    if (!sc) return;

    // Audio transcription (output text from audio-only model)
    if (sc.outputTranscription?.text) {
      this.callbacks?.onTextResponse(sc.outputTranscription.text);
    }

    const parts = sc.modelTurn?.parts;
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
