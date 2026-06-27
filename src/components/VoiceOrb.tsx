import { Mic } from 'lucide-react';

export type OrbPhase = 'idle' | 'listening' | 'searching';

interface VoiceOrbProps {
  phase: OrbPhase;
}

/** 声波律动条的错落延迟（秒），仅 listening 时生效 */
const BAR_DELAYS = [0, 0.18, 0.36, 0.12, 0.3, 0.06, 0.24];

/**
 * 麦克风球 + 声波可视化。
 * idle：轻微呼吸；listening：放大 + 光晕脉冲 + 声波律动条；searching：环形流光。
 * 颜色全部走 TDesign 品牌色变量，自动适配深色模式。
 */
export function VoiceOrb({ phase }: VoiceOrbProps) {
  const listening = phase === 'listening';
  const searching = phase === 'searching';

  return (
    <div className="flex flex-col items-center justify-center select-none">
      <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
        {/* 检索中：旋转渐变环 */}
        {searching && (
          <div
            className="orb-spin-ring absolute rounded-full"
            style={{
              width: 168,
              height: 168,
              background:
                'conic-gradient(from 0deg, transparent 0deg, var(--td-brand-color) 300deg, transparent 360deg)',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
              WebkitMask:
                'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
              opacity: 0.9,
            }}
          />
        )}

        {/* 外层光晕（聆听时脉冲） */}
        <div
          className={`absolute rounded-full ${listening ? 'orb-listening' : ''}`}
          style={{
            width: 128,
            height: 128,
            background: 'var(--td-brand-color-light)',
            transition: 'transform 0.3s ease',
            transform: listening ? 'scale(1.12)' : 'scale(1)',
          }}
        />

        {/* 主体球 */}
        <div
          className={`relative rounded-full flex items-center justify-center shadow-lg ${
            phase === 'idle' ? 'orb-idle' : ''
          }`}
          style={{
            width: 112,
            height: 112,
            background: 'linear-gradient(135deg, var(--td-brand-color), var(--td-brand-color-hover))',
            transition: 'transform 0.3s ease, box-shadow 0.3s ease',
            transform: listening ? 'scale(1.06)' : 'scale(1)',
          }}
        >
          {/* 聆听时显示声波条，否则显示麦克风图标 */}
          {listening ? (
            <div className="flex items-end gap-1" style={{ height: 44 }}>
              {BAR_DELAYS.map((d, i) => (
                <span
                  key={i}
                  className="wave-bar"
                  style={{
                    display: 'inline-block',
                    width: 4,
                    height: 40,
                    borderRadius: 999,
                    background: '#fff',
                    opacity: 0.92,
                    animationDelay: `${d}s`,
                    animationDuration: `${0.8 + (i % 3) * 0.12}s`,
                  }}
                />
              ))}
            </div>
          ) : (
            <Mic size={42} color="#fff" strokeWidth={2.2} />
          )}
        </div>
      </div>

      {/* 提示文案 */}
      <div className="mt-5 text-center h-6" style={{ color: 'var(--td-text-color-secondary)' }}>
        {phase === 'idle' && (
          <span className="text-sm">
            按住{' '}
            <kbd
              className="px-2 py-0.5 rounded-md text-xs font-medium mx-0.5"
              style={{
                backgroundColor: 'var(--td-bg-color-component)',
                border: '1px solid var(--td-component-stroke)',
                color: 'var(--td-text-color-primary)',
              }}
            >
              空格
            </kbd>{' '}
            说话
          </span>
        )}
        {phase === 'listening' && (
          <span className="text-sm font-medium" style={{ color: 'var(--td-brand-color)' }}>
            正在聆听…
          </span>
        )}
        {phase === 'searching' && <span className="text-sm">检索中…</span>}
      </div>
    </div>
  );
}
