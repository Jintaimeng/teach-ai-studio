// 麦克风 PCM 采集 Worklet：把 Float32 音频转成 16bit 小端 PCM，按 ~100ms 分包回传主线程。
// AudioContext 已指定 sampleRate=16000，这里无需再重采样，只做格式转换 + 分包。
class PCMWorklet extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._flushSize = 3200; // 16000 * 0.2s = 200ms（双向流式 bigmodel 最优分包）
  }

  process(inputs) {
    const input = inputs[0];
    const ch = input && input[0];
    if (ch && ch.length) {
      for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
      if (this._buf.length >= this._flushSize) {
        const out = new Int16Array(this._buf.length);
        for (let j = 0; j < this._buf.length; j++) {
          const s = Math.max(-1, Math.min(1, this._buf[j]));
          out[j] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        this.port.postMessage(out.buffer, [out.buffer]);
        this._buf = [];
      }
    }
    return true;
  }
}

registerProcessor("pcm-worklet", PCMWorklet);
