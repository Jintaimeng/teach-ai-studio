import { GraduationCap } from 'lucide-react';
import { VibeChat, type VibeChatConfig } from '../components/report/VibeChat';

const CONFIG: VibeChatConfig = {
  apiEndpoint: '/api/tools/school-report/vibe',
  welcomeEmoji: '🎓',
  welcomeTitle: 'Vibe 择校',
  welcomeDesc: '告诉我你的考研情况，AI 会自主规划、追问关键信息，最终输出一份个性化择校报告',
  exampleText: '「我初试 370 分，想考计算机，目标江苏的 211」',
  reportTitle: '择校报告',
  reportEmoji: '🎓',
  reportNoun: '择校报告',
  sectionLabels: { 冲: '冲刺志愿', 稳: '稳妥志愿', 保: '保底志愿' },
};

export function ZhaixiaoReportPage() {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex items-center gap-2 px-5 py-4 border-b" style={{ borderColor: 'var(--td-component-stroke)' }}>
        <GraduationCap size={20} color="var(--td-brand-color)" />
        <div>
          <h1 className="text-base font-semibold" style={{ color: 'var(--td-text-color-primary)' }}>
            择校报告
          </h1>
          <p className="text-xs" style={{ color: 'var(--td-text-color-secondary)' }}>
            基于 yanbot 考研院校专业历年录取数据，对话式生成个性化择校方案
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0 p-4">
        <VibeChat config={CONFIG} />
      </div>
    </div>
  );
}
