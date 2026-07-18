import React, { useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { QuickGenerate } from '../components/Dashboard/QuickGenerate';
import { ActionButton } from '../components/ui/ActionButton';
import { WorkbenchCard } from '../components/ui/WorkbenchCard';
import useStore from '../store';

export const SourceCollection: React.FC = () => {
  const navigate = useNavigate();
  const todayItems = useStore((state) => state.todayItems);
  const script = useStore((state) => state.script);
  const currentBroadcast = useStore((state) => state.currentBroadcast);
  const isRewriting = useStore((state) => state.isRewriting);
  const newsIntakeRef = useRef<HTMLDivElement>(null);

  const handleRewriteComplete = useCallback(() => {
    navigate('/editor');
  }, [navigate]);

  const handleStartNewsIntake = useCallback(() => {
    const newsIntake = newsIntakeRef.current;
    if (!newsIntake) return;
    newsIntake.scrollIntoView?.({ block: 'start' });
    newsIntake.querySelector<HTMLSelectElement>('select')?.focus();
  }, []);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <Header title="内容工作台" subtitle="收集素材，提炼与写作，再沉淀为成稿或音频" />

      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <WorkbenchCard className="p-5">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-lemon" />
                  <h2 className="font-display text-[17px] font-medium text-ink">选择创作起点</h2>
                </div>
                <p className="mt-2 font-body text-[13px] leading-relaxed text-ink-soft/75">
                  先把素材收进来，再进入编辑器提炼和写作。音频是成稿后的发布选择，不是唯一终点。
                </p>
              </div>
              <ol aria-label="内容创作流程" className="flex flex-wrap items-center gap-2 font-body text-[11px] text-ink-soft/70">
                <li className="rounded-full bg-lemon/25 px-2.5 py-1">1 收集素材</li>
                <li aria-hidden="true">→</li>
                <li className="rounded-full bg-lilac/25 px-2.5 py-1">2 提炼与写作</li>
                <li aria-hidden="true">→</li>
                <li className="rounded-full bg-sage/25 px-2.5 py-1">3 成稿或音频</li>
              </ol>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={handleStartNewsIntake}
                className="ui-pressable group rounded-card border border-lemon/50 bg-lemon/15 p-5 text-left hover:bg-lemon/25"
              >
                <span className="font-body text-[11px] font-medium text-ink-soft/70">AI 今日资讯</span>
                <span className="mt-2 block font-display text-[21px] font-medium leading-tight text-ink">采集资讯并写成稿</span>
                <span className="mt-2 block max-w-md font-body text-[13px] leading-relaxed text-ink-soft/75">
                  从 AI HOT 收集结构化资讯，筛选后提炼为可继续编辑的内容草稿。
                </span>
                <span className="mt-4 inline-flex font-body text-[12px] font-medium text-ink">收集资讯并筛选 →</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/transcribe')}
                className="ui-pressable group rounded-card border border-lilac/55 bg-lilac/15 p-5 text-left hover:bg-lilac/25"
              >
                <span className="font-body text-[11px] font-medium text-ink-soft/70">已有音视频素材</span>
                <span className="mt-2 block font-display text-[21px] font-medium leading-tight text-ink">转录并整理内容</span>
                <span className="mt-2 block max-w-md font-body text-[13px] leading-relaxed text-ink-soft/75">
                  把录音、视频或播客转成可阅读文本，再继续校对、总结或导入写作。
                </span>
                <span className="mt-4 inline-flex font-body text-[12px] font-medium text-ink">上传素材并整理 →</span>
              </button>
            </div>
          </WorkbenchCard>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
            <div ref={newsIntakeRef} id="news-intake" className="scroll-mt-5">
              <QuickGenerate onRewriteComplete={handleRewriteComplete} />
            </div>

            <aside className="space-y-4">
              <WorkbenchCard className="p-5">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sage" />
                    <h2 className="font-display text-[16px] font-medium text-ink">当前创作</h2>
                  </div>
                  {(isRewriting || script || currentBroadcast) && (
                    <span className={`rounded-full px-2.5 py-1 font-body text-[11px] font-medium text-ink ${isRewriting ? 'bg-lilac/30' : 'bg-sage/30'}`}>
                      {isRewriting ? '正在提炼' : '草稿已保留'}
                    </span>
                  )}
                </div>

                <div className="rounded-2xl border border-card-border bg-white/60 p-4">
                  <p className="font-display text-[17px] font-medium leading-snug text-ink">
                    {currentBroadcast?.title || (script ? '未命名稿件' : '还没有进行中的稿件')}
                  </p>
                  {(todayItems.length > 0 || script) && (
                    <p className="mt-2 font-body text-[11px] text-ink-soft/70">
                      {todayItems.length} 条素材 · {script.length} 字草稿
                    </p>
                  )}
                  <p className="mt-2 font-body text-[13px] leading-relaxed text-ink-soft/75">
                    {isRewriting
                      ? '正在把已选资讯提炼为内容草稿，完成后会自动进入编辑器。'
                      : script
                      ? '继续调整结构和表达；定稿后可保留文字成稿，也可以选择音色生成音频。'
                      : '从上方选择一种素材来源。创作进度会在这里保留，方便随时继续。'}
                  </p>
                  {script && (
                    <ActionButton
                      tone="edit"
                      onClick={() => navigate('/editor')}
                      className="mt-3 w-full"
                    >
                      继续提炼与写作
                    </ActionButton>
                  )}
                </div>
              </WorkbenchCard>

              <button
                type="button"
                onClick={() => navigate('/history')}
                className="ui-pressable w-full rounded-card border border-card-border bg-white/55 p-4 text-left hover:bg-white/75"
              >
                <span className="font-display text-[16px] font-medium text-ink">进入内容库</span>
                <span className="mt-1 block font-body text-[12px] leading-relaxed text-ink-soft/70">
                  阅读、整理或复用已经沉淀的成稿、音频与转录内容 →
                </span>
              </button>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SourceCollection;
