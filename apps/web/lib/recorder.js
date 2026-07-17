"use client";
// Captures microphone PCM via Web Audio API and encodes 16-bit mono WAV,
// so the backend (soundfile/whisper) can read it directly.

export class WavRecorder {
  constructor(sampleRate = 16000) {
    this.targetRate = sampleRate;
    this.chunks = [];
    this.recording = false;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.ctx = new AudioContext();
    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.processor = this.ctx.createScriptProcessor(4096, 1, 1);
    this.chunks = [];
    this.recording = true;
    this.processor.onaudioprocess = (e) => {
      if (this.recording) this.chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    };
    this.source.connect(this.processor);
    this.processor.connect(this.ctx.destination);
  }

  async stop() {
    this.recording = false;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    const inputRate = this.ctx.sampleRate;
    await this.ctx.close();

    // concat
    const total = this.chunks.reduce((n, c) => n + c.length, 0);
    const pcm = new Float32Array(total);
    let off = 0;
    for (const c of this.chunks) { pcm.set(c, off); off += c.length; }

    // naive resample to target rate
    const ratio = inputRate / this.targetRate;
    const outLen = Math.floor(pcm.length / ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) out[i] = pcm[Math.floor(i * ratio)];

    return this._encodeWav(out, this.targetRate);
  }

  _encodeWav(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); ws(8, "WAVE");
    ws(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    ws(36, "data"); v.setUint32(40, samples.length * 2, true);
    let o = 44;
    for (let i = 0; i < samples.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    // base64
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin);
  }
}
