import { ClipboardList } from 'lucide-react';
import { VibeChat, type VibeChatConfig } from '../components/report/VibeChat';

const CONFIG: VibeChatConfig = {
  apiEndpoint: '/api/tools/tiaoji-report/vibe',
  welcomeEmoji: '🧭',
  welcomeTitle: 'Vibe 调剂',
  welcomeDesc: '告诉我你的分数与意向，AI 会筛选「分数已过线、具备录取或征集/调剂机会」的院校专业，输出调剂报告',
  exampleText: '「我高考 540 分，物理组，能接受调剂，偏好河北本省」',
  reportTitle: '调剂报告',
  reportEmoji: '🧭',
  reportNoun: '调剂报告',
  sectionLabels: { 冲: '可冲调剂', 稳: '稳妥调剂', 保: '保底调剂' },
};

export function TiaojiReportPage() {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: 'var(--td-component-stroke)' }}>
        <ClipboardList size={20} color="var(--td-brand-color)" />
        <div>
          <h1 className="text-base font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
            调剂报告
          </h1>
          <p className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
            基于 2025 河北省本科批真实录取数据，对话式生成调剂/征集志愿方案
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0 p-4">
        <VibeChat config={CONFIG} />
      </div>
    </div>
  );
}
