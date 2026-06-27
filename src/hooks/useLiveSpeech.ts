import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 按住说话（push-to-talk）的连续语音识别 Hook，基于浏览器原生 Web Speech API。
 *
 * 与 useSpeech 的区别：
 * - continuous=true，按住期间持续识别；onend 自动重启续接（Chrome 静音/超时后会 end）。
 * - 维护 final（已确定段落累加）+ interim（临时结果），transcript = final + interim。
 * - 由调用方在按下时 start()、松开时 stop()。
 *
 * 仅 Chrome/Edge 等支持；不支持时 supported=false。
 */
export function useLiveSpeech() {
  const SpeechRecognition =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : undefined;
  const supported = Boolean(SpeechRecognition);

  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');

  const recognitionRef = useRef<any>(null);
  const finalRef = useRef('');        // 已确定（isFinal）的累计文本
  const heldRef = useRef(false);      // 是否仍处于「按住」状态（用于 onend 自动续跑）

  useEffect(() => {
    if (!supported) return;

    const recognition = new SpeechRecognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let interim = '';
      // 从 resultIndex 起处理本次新增的结果，已确定的拼到 finalRef
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const text = res[0]?.transcript ?? '';
        if (res.isFinal) {
          finalRef.current += text;
        } else {
          interim += text;
        }
      }
      setTranscript((finalRef.current + interim).trim());
    };

    recognition.onend = () => {
      // 仍按住 → 自动续接；否则结束
      if (heldRef.current) {
        try {
          recognition.start();
        } catch {
          /* 偶发已在运行，忽略 */
        }
      } else {
        setListening(false);
      }
    };

    recognition.onerror = (e: any) => {
      // no-speech / aborted 等非致命错误：若仍按住，交给 onend 续跑
      if (e?.error === 'not-allowed' || e?.error === 'service-not-allowed') {
        heldRef.current = false;
        setListening(false);
      }
    };

    recognitionRef.current = recognition;

    return () => {
      heldRef.current = false;
      try {
        recognition.stop();
      } catch {
        /* noop */
      }
      recognitionRef.current = null;
    };
  }, [supported]);

  /** 清空累计文本（每次新一轮按下前调用） */
  const reset = useCallback(() => {
    finalRef.current = '';
    setTranscript('');
  }, []);

  const start = useCallback(() => {
    if (!recognitionRef.current) return;
    heldRef.current = true;
    setListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      /* 已在运行（InvalidStateError），忽略 */
    }
  }, []);

  const stop = useCallback(() => {
    heldRef.current = false;
    setListening(false);
    if (!recognitionRef.current) return;
    try {
      recognitionRef.current.stop();
    } catch {
      /* noop */
    }
  }, []);

  return { supported, listening, transcript, start, stop, reset };
}
