import React, { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { QuickGenerate } from '../components/Dashboard/QuickGenerate';
import { ModalShell } from '../components/ModalShell';
import { ActionButton, ActionCard, WorkbenchCard } from '../components/UI';
import useStore from '../store';

export const SourceCollection: React.FC = () => {
  const navigate = useNavigate();
  const todayItems = useStore((state) => state.todayItems);
  const script = useStore((state) => state.script);
  const currentBroadcast = useStore((state) => state.currentBroadcast);
  const isRewriting = useStore((state) => state.isRewriting);
  const [isNewsIntakeOpen, setIsNewsIntakeOpen] = useState(false);

  const handleRewriteComplete = useCallback(() => {
    navigate('/editor');
  }, [navigate]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="工作台" subtitle="选择素材来源，完成一条可发布的语音内容" />

      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <WorkbenchCard heading="新建内容" accent="lemon">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <ActionCard
                onClick={() => setIsNewsIntakeOpen(true)}
                aria-label="AI 今日资讯"
                accent="lemon"
              >
                <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/60">从结构化信息开始</span>
                <span className="mt-2 block font-display text-[22px] font-medium text-ink">AI 今日资讯</span>
                <span className="mt-2 block max-w-md font-body text-[12px] leading-relaxed text-ink-soft/70">
                  获取 AI HOT 资讯，筛选后改写为适合播报的稿件。
                </span>
                <span className="mt-4 inline-flex font-body text-[11px] font-medium text-ink transition-transform duration-150 group-hover:translate-x-1">开始采集 →</span>
              </ActionCard>
              <ActionCard
                onClick={() => navigate('/transcribe')}
                accent="lilac"
              >
                <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/60">从已有素材开始</span>
                <span className="mt-2 block font-display text-[22px] font-medium text-ink">音视频整理</span>
                <span className="mt-2 block max-w-md font-body text-[12px] leading-relaxed text-ink-soft/70">
                  上传音视频，选择普通转录或播客整理，并在内容库继续总结与校对。
                </span>
                <span className="mt-4 inline-flex font-body text-[11px] font-medium text-ink transition-transform duration-150 group-hover:translate-x-1">开始整理 →</span>
              </ActionCard>
            </div>
          </WorkbenchCard>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
            <div id="news-intake" className="scroll-mt-5">
              <QuickGenerate onRewriteComplete={handleRewriteComplete} />
            </div>

            <aside className="space-y-4">
              <WorkbenchCard
                heading="当前任务"
                accent="sage"
                headerActions={(script || currentBroadcast) && (
                    <span className="rounded-full bg-sage/30 px-2.5 py-1 font-body text-[9px] uppercase tracking-wider text-ink">进行中</span>
                )}
              >

                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-2xl bg-paper/70 border border-card-border p-3">
                    <p className="font-body text-[10px] uppercase tracking-wider text-ink-soft">资讯</p>
                    <p className="mt-1 font-display text-[26px] font-medium leading-none text-ink">{todayItems.length}</p>
                  </div>
                  <div className="rounded-2xl bg-paper/70 border border-card-border p-3">
                    <p className="font-body text-[10px] uppercase tracking-wider text-ink-soft">稿件字数</p>
                    <p className="mt-1 font-display text-[26px] font-medium leading-none text-ink">{script.length}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-card-border bg-white/60 p-4">
                  <p className="font-body text-[12px] font-medium text-ink">
                    {currentBroadcast?.title || (script ? '未命名稿件' : '还没有进行中的稿件')}
                  </p>
                  <p className="mt-1 font-body text-[12px] leading-relaxed text-ink-soft/70">
                    {isRewriting
                      ? '正在改写资讯，完成后会自动进入编辑器。'
                      : script
                      ? '稿件已准备好，可以继续编辑、选择音色和生成语音。'
                      : '选择一种素材来源开始，工作台会保留当前进度。'}
                  </p>
                  {script && (
                    <ActionButton
                      onClick={() => navigate('/editor')}
                      variant="confirm"
                      className="mt-3 w-full"
                    >
                      继续编辑
                    </ActionButton>
                  )}
                </div>
              </WorkbenchCard>

              <ActionCard
                onClick={() => navigate('/history')}
                padding="compact"
              >
                <span className="font-display text-[16px] font-medium text-ink">打开内容库</span>
                <span className="mt-1 block font-body text-[11px] text-ink-soft/60">查看播报成品和转录文稿 →</span>
              </ActionCard>
            </aside>
          </div>
        </div>
      </main>

      <ModalShell
        isOpen={isNewsIntakeOpen}
        title="AI 今日资讯"
        subtitle="获取 AI HOT 资讯，筛选后改写为适合播报的稿件。"
        onClose={() => setIsNewsIntakeOpen(false)}
        variant="fullscreen"
        accent="lemon"
        contentClassName="p-5 sm:p-6"
      >
        <div className="mx-auto max-w-5xl">
          <QuickGenerate onRewriteComplete={handleRewriteComplete} />
        </div>
      </ModalShell>
    </div>
  );
};

export default SourceCollection;
