import { cn } from '../../../utils/cn';

/** 轻量分隔线（替代 shadcn/ui Separator）。 */
export function Separator({ className }: { className?: string }) {
  return <div className={cn('h-px w-full shrink-0 bg-border', className)} />;
}
