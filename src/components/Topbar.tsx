import { useLocation } from 'react-router-dom';
import { Button, Tooltip } from 'tdesign-react';
import {
  SunnyIcon,
  MoonIcon,
  MenuFoldIcon,
  MenuUnfoldIcon,
  UserIcon,
} from 'tdesign-icons-react';
import { matchModule } from '../config/modules';
import { Theme } from '../types';

interface TopbarProps {
  sidebarOpen: boolean;
  theme: Theme;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
}

export function Topbar({ sidebarOpen, theme, onToggleSidebar, onToggleTheme }: TopbarProps) {
  const location = useLocation();
  const mod = matchModule(location.pathname);

  return (
    <header
      className="h-16 flex justify-between items-center px-5 flex-shrink-0 border-b"
      style={{
        backgroundColor: 'var(--td-bg-color-page)',
        borderColor: 'var(--td-component-stroke)',
      }}
    >
      <div className="flex items-center gap-3">
        <Button
          variant="text"
          shape="circle"
          icon={sidebarOpen ? <MenuFoldIcon /> : <MenuUnfoldIcon />}
          onClick={onToggleSidebar}
        />
        {/* 面包屑 */}
        <div className="flex items-center gap-2 text-sm">
          <span style={{ color: 'var(--td-text-color-placeholder)' }}>{mod?.group ?? ''}</span>
          {mod?.group && <span style={{ color: 'var(--td-text-color-placeholder)' }}>/</span>}
          <span className="font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
            {mod?.label ?? ''}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip content={theme === 'light' ? '切换到深色模式' : '切换到浅色模式'}>
          <Button
            variant="outline"
            shape="circle"
            icon={theme === 'light' ? <MoonIcon /> : <SunnyIcon />}
            onClick={onToggleTheme}
          />
        </Tooltip>
        <Tooltip content="当前用户">
          <Button variant="outline" shape="circle" icon={<UserIcon />} />
        </Tooltip>
      </div>
    </header>
  );
}
