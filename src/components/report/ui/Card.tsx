import React from 'react';
import { cn } from '../../../utils/cn';

/** 轻量 Card 原语（替代 shadcn/ui，纯 div + Tailwind）。 */

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('rounded-xl border bg-card text-card-foreground shadow-sm', className)}>
      {children}
    </div>
  );
}

export function CardHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('flex flex-col gap-1.5 p-4', className)}>{children}</div>;
}

export function CardTitle({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('font-semibold leading-none tracking-tight', className)}>{children}</div>;
}

export function CardContent({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn('p-4 pt-0', className)}>{children}</div>;
}
