import { Routes, Route } from 'react-router-dom';
import type { ComponentType } from 'react';
import '@tdesign-react/chat/es/style/index.js';

import { MODULES } from './config/modules';
import { useAgents } from './hooks/useAgents';
import { AdminLayout } from './layouts/AdminLayout';
import { DashboardPage } from './pages/DashboardPage';
import { AssistantPage } from './pages/AssistantPage';
import { ZhaixiaoReportPage } from './pages/ZhaixiaoReportPage';
import { TiaojiReportPage } from './pages/TiaojiReportPage';
import { PlaceholderPage } from './components/PlaceholderPage';
import { SettingsPage } from './components/SettingsPage';

/** 自定义页面模块 -> 组件映射（type:'page' 且非占位的模块在此注册） */
const PAGE_COMPONENTS: Record<string, ComponentType> = {
  'zhaixiao-report': ZhaixiaoReportPage,
  'tiaoji-report': TiaojiReportPage,
};

/** 系统设置路由：注入 useAgents（localStorage） */
function SettingsRoute() {
  const { agents, addAgent, updateAgent, deleteAgent } = useAgents();
  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <SettingsPage agents={agents} onAdd={addAgent} onUpdate={updateAgent} onDelete={deleteAgent} />
    </div>
  );
}

function App() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        {MODULES.map((m) => {
          if (m.type === 'settings') {
            return <Route key={m.id} path={m.path} element={<SettingsRoute />} />;
          }
          if (m.type === 'chat') {
            return [
              <Route key={m.id} path={m.path} element={<AssistantPage module={m} />} />,
              <Route key={`${m.id}-session`} path={`${m.path}/:sessionId`} element={<AssistantPage module={m} />} />,
            ];
          }
          // type === 'page'
          if (m.id === 'home') {
            return <Route key={m.id} path={m.path} element={<DashboardPage />} />;
          }
          const PageComponent = PAGE_COMPONENTS[m.id];
          if (PageComponent) {
            return <Route key={m.id} path={m.path} element={<PageComponent />} />;
          }
          return (
            <Route
              key={m.id}
              path={m.path}
              element={<PlaceholderPage title={m.placeholder?.title || m.label} desc={m.placeholder?.desc} />}
            />
          );
        })}
      </Route>
    </Routes>
  );
}

export default App;
