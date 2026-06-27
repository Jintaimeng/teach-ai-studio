import { Tooltip, Button } from 'tdesign-react';
import { useSpeech } from '../hooks/useSpeech';

interface VoiceInputButtonProps {
  /** 把识别到的文本回填到输入框 */
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

/**
 * 麦克风按钮：基于浏览器原生 Web Speech API。
 * 不支持的浏览器不渲染任何内容。
 */
export function VoiceInputButton({ onTranscript, disabled }: VoiceInputButtonProps) {
  const { supported, listening, toggle } = useSpeech(onTranscript);

  if (!supported) return null;

  return (
    <Tooltip content={listening ? '点击停止' : '语音输入'}>
      <Button
        variant={listening ? 'base' : 'outline'}
        shape="circle"
        theme={listening ? 'danger' : 'default'}
        disabled={disabled}
        onClick={toggle}
        aria-label="语音输入"
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>{listening ? '■' : '🎤'}</span>
      </Button>
    </Tooltip>
  );
}
