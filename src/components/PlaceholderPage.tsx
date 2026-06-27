import { Sparkles } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  desc?: string;
}

export function PlaceholderPage({ title, desc }: PlaceholderPageProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
        style={{ backgroundColor: 'var(--td-brand-color-light)' }}
      >
        <Sparkles size={36} color="var(--td-brand-color)" />
      </div>
      <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--td-text-color-primary)' }}>
        {title}
      </h2>
      <p className="text-sm max-w-md" style={{ color: 'var(--td-text-color-secondary)' }}>
        {desc || '该功能正在建设中，敬请期待。'}
      </p>
      <div
        className="mt-6 px-4 py-1.5 rounded-full text-xs font-medium"
        style={{ backgroundColor: 'var(--td-bg-color-component)', color: 'var(--td-text-color-placeholder)' }}
      >
        建设中
      </div>
    </div>
  );
}
