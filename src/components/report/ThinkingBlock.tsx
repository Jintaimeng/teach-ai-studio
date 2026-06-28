import { useState } from 'react';
import { CheckCircle2, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '../../utils/cn';

/** 思考过程动画块（移植自 yanbot-claw）。 */
export function ThinkingBlock({
  label,
  steps,
  done,
}: {
  label: string;
  steps: string[];
  done: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  if (done) {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs text-green-700 transition-colors hover:bg-green-100 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400"
        >
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>
            {label}完成（{steps.length} 步）
          </span>
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>

        {expanded && (
          <div className="ml-1 space-y-1">
            {steps.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                {step}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="min-w-[220px] rounded-xl border bg-muted/60 px-4 py-3 text-sm">
        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
          {label}中…
        </div>
        <div className="space-y-1.5">
          {steps.map((step, i) => {
            const isLast = i === steps.length - 1;
            return (
              <div
                key={i}
                className={cn(
                  'flex items-center gap-2 text-xs',
                  isLast ? 'text-foreground' : 'text-muted-foreground'
                )}
              >
                {isLast ? (
                  <Loader2 className="h-3 w-3 animate-spin shrink-0 text-accent" />
                ) : (
                  <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                )}
                {step}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
