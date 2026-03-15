/**
 * AudioWorkletProcessor that converts float32 audio to 16-bit PCM
 * and posts base64-encoded chunks to the main thread.
 */
class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const float32 = input[0];
    const pcm16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      pcm16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32768)));
    }

    // Convert to base64
    const bytes = new Uint8Array(pcm16.buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    this.port.postMessage(btoa(binary));

    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);
