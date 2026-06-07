import React, { useState, useEffect } from 'react';
import { useStore } from '../../store';

export const ScriptPreview: React.FC = () => {
  const { script, updateScript, settings, splitScriptAction, isSplitting, currentBroadcast, segments } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [localScript, setLocalScript] = useState(script);
  const [showSaved, setShowSaved] = useState(false);
  const [splitError, setSplitError] = useState<string | null>(null);

  useEffect(() => {
    setLocalScript(script);
  }, [script]);

  const handleSave = () => {
    updateScript(localScript);
    setIsEditing(false);
    setShowSaved(true);
    setTimeout(() => setShowSaved(false), 600);
  };

  const handleCancel = () => {
    setLocalScript(script);
    setIsEditing(false);
  };

  const handleAddOpening = () => {
    const newScript = settings.opening_script + '\n\n' + script;
    updateScript(newScript);
    setLocalScript(newScript);
  };

  const handleAddClosing = () => {
    const newScript = script + '\n\n' + settings.closing_script;
    updateScript(newScript);
    setLocalScript(newScript);
  };

  const handleSplit = async () => {
    if (!script) return;
    setSplitError(null);
    try {
      await splitScriptAction(script);
    } catch {
      setSplitError('切分失败，请稍后重试');
    }
  };

  const isAlreadySplit = currentBroadcast?.mode === 'segmented' && segments.length > 0;

  const wordCount = script.length;
  const estimatedDuration = Math.ceil(wordCount / 4);

  return (
    <div className="bg-white/[0.55] backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border" style={{ animation: 'fade-in-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.08s both' }}>
      {/* 标题 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full bg-pink transition-transform duration-300 ${showSaved ? 'animate-scale-bounce' : ''}`} />
          <h3 className="font-display italic text-[14px] font-medium text-ink-soft">口播稿预览</h3>
        </div>
        <div className="flex items-center gap-2">
          {!isEditing && script && (
            <>
              <span className="font-body text-[10px] uppercase tracking-wider text-ink-soft/40">
                {wordCount} 字 · ≈ {estimatedDuration} 秒
              </span>
              <button
                onClick={() => setIsEditing(true)}
                className="font-body text-[12px] text-ink-soft hover:text-ink transition-colors"
              >
                编辑
              </button>
            </>
          )}
        </div>
      </div>

      {/* 内容区 */}
      {isEditing ? (
        <div className="animate-fade-in">
          <textarea
            value={localScript}
            onChange={(e) => setLocalScript(e.target.value)}
            className="w-full h-64 bg-white/60 text-ink rounded-2xl p-4 border border-card-border focus:border-ink/20 focus:outline-none resize-none font-body text-[13px] leading-[1.9] transition-colors"
            placeholder="在此编辑口播稿..."
          />
          <div className="flex justify-end gap-2 mt-3">
            <button
              onClick={handleCancel}
              className="px-4 py-2 font-body text-[12px] text-ink-soft hover:text-ink transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 font-body text-[12px] bg-sage hover:brightness-105 text-ink rounded-xl shadow-btn transition-all duration-150"
            >
              保存
            </button>
          </div>
        </div>
      ) : (
        <div>
          {script ? (
            <div className="bg-white/60 rounded-2xl p-4 min-h-[16rem] max-h-80 overflow-y-auto border border-card-border">
              <pre className="text-ink font-body text-[13px] leading-[1.9] whitespace-pre-wrap">
                {script}
              </pre>
            </div>
          ) : (
            <div className="bg-white/40 rounded-2xl p-8 min-h-[16rem] flex items-center justify-center border border-card-border">
              <p className="font-body text-[12px] text-ink-soft/50">
                请先获取今日资讯并点击「一键改写口播稿」
              </p>
            </div>
          )}
        </div>
      )}

      {/* 操作栏 */}
      {script && !isEditing && (
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-card-border">
          <button
            onClick={handleSplit}
            disabled={isSplitting || isAlreadySplit}
            className="font-body text-[11px] px-3 py-1.5 bg-pink/20 hover:bg-pink/30 disabled:opacity-40 text-ink-soft rounded-full transition-colors uppercase tracking-wider flex items-center gap-1.5"
          >
            {isSplitting ? (
              <>
                <span className="w-2.5 h-0.5 bg-ink/20 rounded-full overflow-hidden">
                  <span className="block h-full bg-ink/50 rounded-full animate-pulse" style={{ width: '60%' }} />
                </span>
                切分中...
              </>
            ) : isAlreadySplit ? (
              '✓ 已切分'
            ) : (
              '✦ 切分口播稿'
            )}
          </button>
          <button
            onClick={handleAddOpening}
            className="font-body text-[11px] px-3 py-1.5 bg-sage/20 hover:bg-sage/30 text-ink-soft rounded-full transition-colors uppercase tracking-wider"
          >
            + 添加开场白
          </button>
          <button
            onClick={handleAddClosing}
            className="font-body text-[11px] px-3 py-1.5 bg-sage/20 hover:bg-sage/30 text-ink-soft rounded-full transition-colors uppercase tracking-wider"
          >
            + 添加结束语
          </button>
        </div>
      )}

      {/* 切分错误提示 */}
      {splitError && (
        <div className="mt-2 bg-pink/10 border border-pink/30 rounded-xl p-2.5 text-ink text-[11px] font-body animate-shake">
          {splitError}
        </div>
      )}
    </div>
  );
};

export default ScriptPreview;
