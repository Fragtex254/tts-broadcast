import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { QuickGenerate } from '../components/Dashboard/QuickGenerate';
import useStore from '../store';

const workflowSteps = [
  { label: '采集', detail: '获取今日资讯' },
  { label: '改写', detail: '生成口播稿' },
  { label: '编辑', detail: '切分与润色' },
  { label: '合成', detail: '生成音频' },
  { label: '保存', detail: '归档播报' },
];

export const SourceCollection: React.FC = () => {
  const navigate = useNavigate();
  const todayItems = useStore((s) => s.todayItems);
  const script = useStore((s) => s.script);
  const currentBroadcast = useStore((s) => s.currentBroadcast);
  const isRewriting = useStore((s) => s.isRewriting);

  const handleRewriteComplete = useCallback(() => {
    navigate('/editor');
  }, [navigate]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="信源收集" subtitle="获取今日 AI 资讯并改写为口播稿" />

      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.75fr)]">
          <div className="space-y-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-card p-4 shadow-card border border-card-border animate-fade-in-up">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {workflowSteps.map((step, index) => (
                  <div
                    key={step.label}
                    className={`rounded-2xl border px-3 py-3 transition-colors ${
                      index === 0
                        ? 'bg-lemon/25 border-lemon/60'
                        : 'bg-white/60 border-card-border'
                    }`}
                  >
                    <div className="font-display text-[18px] font-medium text-ink">{String(index + 1).padStart(2, '0')}</div>
                    <div className="mt-1 font-body text-[12px] font-medium text-ink">{step.label}</div>
                    <div className="mt-0.5 font-body text-[10px] leading-snug text-ink-soft">{step.detail}</div>
                  </div>
                ))}
              </div>
            </div>

            <QuickGenerate onRewriteComplete={handleRewriteComplete} />
          </div>

          <aside className="space-y-4">
            <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border animate-fade-in-up">
              <div className="flex items-center gap-2 mb-4">
                <span className="w-2 h-2 rounded-full bg-lilac" />
                <h3 className="font-display italic text-[14px] font-medium text-ink-soft">今日工作台</h3>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-2xl bg-paper/70 border border-card-border p-3">
                  <p className="font-body text-[10px] uppercase tracking-wider text-ink-soft">已载入资讯</p>
                  <p className="mt-1 font-display text-[26px] font-medium leading-none text-ink">{todayItems.length}</p>
                </div>
                <div className="rounded-2xl bg-paper/70 border border-card-border p-3">
                  <p className="font-body text-[10px] uppercase tracking-wider text-ink-soft">稿件字数</p>
                  <p className="mt-1 font-display text-[26px] font-medium leading-none text-ink">{script.length}</p>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-card-border bg-white/60 p-4">
                <p className="font-body text-[12px] font-medium text-ink">下一步</p>
                <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-soft">
                  {isRewriting
                    ? '正在把资讯改写成口播稿，完成后会进入编辑器。'
                    : script
                    ? '稿件已经准备好，可以继续编辑、切分并生成语音。'
                    : todayItems.length > 0
                    ? '资讯已载入，点击一键改写生成口播稿。'
                    : '先获取今日资讯，再进入改写和语音生成流程。'}
                </p>
                {script && (
                  <button
                    type="button"
                    onClick={() => navigate('/editor')}
                    className="mt-3 w-full bg-lilac hover:brightness-105 text-ink rounded-xl px-4 py-2.5 shadow-btn font-body text-[12px] font-medium uppercase tracking-wider transition-all duration-150"
                  >
                    继续编辑
                  </button>
                )}
              </div>
            </section>

            <section className="bg-white/70 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border animate-fade-in-up">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-blush" />
                <h3 className="font-display italic text-[14px] font-medium text-ink-soft">最近播报</h3>
              </div>
              {currentBroadcast ? (
                <div>
                  <p className="font-body text-[13px] font-medium leading-snug text-ink">{currentBroadcast.title}</p>
                  <p className="mt-2 font-body text-[11px] leading-relaxed text-ink-soft">
                    状态：{currentBroadcast.status} · 模式：{currentBroadcast.mode === 'segmented' ? '分段' : '整篇'}
                  </p>
                </div>
              ) : (
                <p className="font-body text-[12px] leading-relaxed text-ink-soft">
                  暂无正在编辑的播报。完成第一次改写后，这里会显示当前稿件状态。
                </p>
              )}
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default SourceCollection;
