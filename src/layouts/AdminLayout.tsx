import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { SideMenu } from '../components/SideMenu';
import { Topbar } from '../components/Topbar';
import { useTheme } from '../hooks/useTheme';

export function AdminLayout() {
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen w-screen" style={{ backgroundColor: 'var(--td-bg-color-page)' }}>
      <SideMenu collapsed={!sidebarOpen} />

      <main className="flex-1 flex flex-col min-w-0">
        <Topbar
          sidebarOpen={sidebarOpen}
          theme={theme}
          onToggleSidebar={() => setSidebarOpen((v) => !v)}
          onToggleTheme={toggleTheme}
        />
        <div className="flex-1 min-h-0 flex flex-col" style={{ backgroundColor: 'var(--td-bg-color-page)' }}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
