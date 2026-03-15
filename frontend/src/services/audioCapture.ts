/**
 * Captures microphone audio as base64-encoded 16kHz 16-bit PCM chunks,
 * suitable for streaming to the Gemini Live API.
 * Uses AudioWorkletProcessor when available, falls back to ScriptProcessorNode.
 */
export class AudioCapture {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onChunk: ((base64Pcm: string) => void) | null = null;

  async start(onChunk: (base64Pcm: string) => void) {
    this.onChunk = onChunk;

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true },
    });

    this.context = new AudioContext({ sampleRate: 16000 });
    const source = this.context.createMediaStreamSource(this.stream);

    // Try AudioWorklet first (modern), fall back to ScriptProcessor (deprecated)
    if (this.context.audioWorklet) {
      try {
        await this.context.audioWorklet.addModule('/pcm-worklet.js');
        this.workletNode = new AudioWorkletNode(this.context, 'pcm-processor');
        this.workletNode.port.onmessage = (e) => {
          this.onChunk?.(e.data);
        };
        source.connect(this.workletNode);
        this.workletNode.connect(this.context.destination);
        return;
      } catch (err) {
        console.warn('[AudioCapture] AudioWorklet failed, falling back to ScriptProcessor:', err);
      }
    }

    // Fallback: ScriptProcessorNode (deprecated but widely supported)
    this.processor = this.context.createScriptProcessor(4096, 1, 1);
    this.processor.onaudioprocess = (e) => {
      const float32 = e.inputBuffer.getChannelData(0);
      const pcm16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32768)));
      }

      const bytes = new Uint8Array(pcm16.buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      this.onChunk?.(btoa(binary));
    };

    source.connect(this.processor);
    this.processor.connect(this.context.destination);
  }

  stop() {
    this.workletNode?.disconnect();
    this.workletNode = null;
    this.processor?.disconnect();
    this.processor = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.context?.close();
    this.context = null;
    this.onChunk = null;
  }
}
