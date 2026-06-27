import { useNavigate, useLocation } from 'react-router-dom';
import { Tooltip } from 'tdesign-react';
import { Bot } from 'lucide-react';
import { APP_CONFIG } from '../config';
import { MODULES, matchModule } from '../config/modules';
import { ICON_MAP } from '../utils/iconMap';

interface SideMenuProps {
  collapsed: boolean;
}

export function SideMenu({ collapsed }: SideMenuProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeModule = matchModule(location.pathname);

  // 按 group 分组（保持注册表顺序）
  const groups: { group: string; items: typeof MODULES }[] = [];
  for (const m of MODULES) {
    let g = groups.find((x) => x.group === m.group);
    if (!g) {
      g = { group: m.group, items: [] };
      groups.push(g);
    }
    g.items.push(m);
  }

  return (
    <aside
      className="flex flex-col flex-shrink-0 transition-all duration-300 overflow-hidden border-r"
      style={{
        width: collapsed ? 72 : 248,
        backgroundColor: 'var(--td-bg-color-container)',
        borderColor: 'var(--td-component-stroke)',
      }}
    >
      {/* 品牌区 */}
      <div className="h-16 px-4 flex items-center flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 shadow-md"
            style={{
              background: 'linear-gradient(135deg, var(--td-brand-color), var(--td-brand-color-hover))',
            }}
          >
            <span className="text-white text-base font-bold">{APP_CONFIG.nameInitial}</span>
          </div>
          {!collapsed && (
            <span
              className="text-base font-semibold truncate"
              style={{ color: 'var(--td-text-color-primary)' }}
            >
              {APP_CONFIG.name}
            </span>
          )}
        </div>
      </div>

      {/* 菜单 */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3">
        {groups.map((g) => (
          <div key={g.group}>
            {!collapsed && <div className="side-menu-group-title">{g.group}</div>}
            {collapsed && <div className="h-3" />}
            {g.items.map((m) => {
              const Icon = ICON_MAP[m.icon] || Bot;
              const isActive = activeModule?.id === m.id;
              const item = (
                <div
                  key={m.id}
                  className={`side-menu-item ${isActive ? 'is-active' : ''} ${collapsed ? 'justify-center' : ''}`}
                  style={collapsed ? { padding: '10px 0' } : undefined}
                  onClick={() => navigate(m.path)}
                >
                  <span className="side-menu-icon flex items-center justify-center flex-shrink-0">
                    <Icon size={20} />
                  </span>
                  {!collapsed && <span className="truncate">{m.label}</span>}
                </div>
              );
              return collapsed ? (
                <Tooltip key={m.id} content={m.label} placement="right">
                  {item}
                </Tooltip>
              ) : (
                item
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
