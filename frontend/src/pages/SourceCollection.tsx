import React, { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '../components/Layout/Header';
import { QuickGenerate } from '../components/Dashboard/QuickGenerate';
import useStore from '../store';

export const SourceCollection: React.FC = () => {
  const navigate = useNavigate();
  const todayItems = useStore((state) => state.todayItems);
  const script = useStore((state) => state.script);
  const currentBroadcast = useStore((state) => state.currentBroadcast);
  const isRewriting = useStore((state) => state.isRewriting);

  const handleRewriteComplete = useCallback(() => {
    navigate('/editor');
  }, [navigate]);

  const handleFocusNews = () => {
    document.getElementById('news-intake')?.scrollIntoView({ block: 'start' });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <Header title="工作台" subtitle="选择素材来源，完成一条可发布的语音内容" />

      <main className="flex-1 overflow-y-auto p-5 sm:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border animate-fade-in-up">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-lemon" />
              <h3 className="font-display italic text-[14px] font-medium text-ink-soft">新建内容</h3>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={handleFocusNews}
                className="group rounded-card border border-lemon/50 bg-lemon/15 p-5 text-left transition-all duration-150 hover:-translate-y-px hover:bg-lemon/25 hover:shadow-card active:translate-y-0"
              >
                <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/60">从结构化信息开始</span>
                <span className="mt-2 block font-display text-[22px] font-medium text-ink">AI 今日资讯</span>
                <span className="mt-2 block max-w-md font-body text-[12px] leading-relaxed text-ink-soft/70">
                  获取 AI HOT 资讯，筛选后改写为适合播报的稿件。
                </span>
                <span className="mt-4 inline-flex font-body text-[11px] font-medium text-ink transition-transform duration-150 group-hover:translate-x-1">开始采集 →</span>
              </button>
              <button
                type="button"
                onClick={() => navigate('/transcribe')}
                className="group rounded-card border border-lilac/55 bg-lilac/15 p-5 text-left transition-all duration-150 hover:-translate-y-px hover:bg-lilac/25 hover:shadow-card active:translate-y-0"
              >
                <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/60">从已有素材开始</span>
                <span className="mt-2 block font-display text-[22px] font-medium text-ink">音视频转录</span>
                <span className="mt-2 block max-w-md font-body text-[12px] leading-relaxed text-ink-soft/70">
                  上传一个或多个音视频，自动转成可编辑、可排版的稿件。
                </span>
                <span className="mt-4 inline-flex font-body text-[11px] font-medium text-ink transition-transform duration-150 group-hover:translate-x-1">开始转录 →</span>
              </button>
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.7fr)]">
            <div id="news-intake" className="scroll-mt-5">
              <QuickGenerate onRewriteComplete={handleRewriteComplete} />
            </div>

            <aside className="space-y-4">
              <section
                className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border"
                style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.06s both' }}
              >
                <div className="flex items-center justify-between gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-sage" />
                    <h3 className="font-display italic text-[14px] font-medium text-ink-soft">当前任务</h3>
                  </div>
                  {(script || currentBroadcast) && (
                    <span className="rounded-full bg-sage/30 px-2.5 py-1 font-body text-[9px] uppercase tracking-wider text-ink">进行中</span>
                  )}
                </div>

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
                    <button
                      type="button"
                      onClick={() => navigate('/editor')}
                      className="mt-3 w-full rounded-xl bg-sage px-4 py-2.5 font-body text-[12px] font-medium text-ink shadow-btn transition-all duration-150 hover:-translate-y-px hover:brightness-105 active:translate-y-0 active:shadow-none"
                    >
                      继续编辑
                    </button>
                  )}
                </div>
              </section>

              <button
                type="button"
                onClick={() => navigate('/history')}
                className="w-full rounded-card border border-card-border bg-white/55 p-4 text-left shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-white/75 active:translate-y-0"
              >
                <span className="font-display text-[16px] font-medium text-ink">打开内容库</span>
                <span className="mt-1 block font-body text-[11px] text-ink-soft/60">查看播报成品和转录文稿 →</span>
              </button>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
};

export default SourceCollection;
