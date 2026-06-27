import { useNavigate } from 'react-router-dom';
import { Bot } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { MODULES } from '../config/modules';
import { ICON_MAP } from '../utils/iconMap';

export function DashboardPage() {
  const navigate = useNavigate();
  const entries = MODULES.filter((m) => m.id !== 'home');

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="max-w-5xl mx-auto">
        {/* 欢迎横幅 */}
        <div
          className="rounded-2xl p-8 mb-8 text-white shadow-md"
          style={{
            background: 'linear-gradient(135deg, var(--td-brand-color), var(--td-brand-color-hover))',
          }}
        >
          <h1 className="text-2xl font-bold mb-2">欢迎使用{APP_CONFIG.name}</h1>
          <p className="text-white/85 text-sm">{APP_CONFIG.description}，选择下方模块开始你的教学工作。</p>
        </div>

        {/* 模块入口卡片 */}
        <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--td-text-color-primary)' }}>
          功能模块
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {entries.map((m) => {
            const Icon = ICON_MAP[m.icon] || Bot;
            return (
              <div
                key={m.id}
                className="admin-card is-clickable p-5"
                onClick={() => navigate(m.path)}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4"
                  style={{ backgroundColor: 'var(--td-brand-color-light)' }}
                >
                  <Icon size={22} color="var(--td-brand-color)" />
                </div>
                <div className="text-base font-semibold mb-1" style={{ color: 'var(--td-text-color-primary)' }}>
                  {m.label}
                </div>
                <div className="text-sm" style={{ color: 'var(--td-text-color-secondary)' }}>
                  {m.desc}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
