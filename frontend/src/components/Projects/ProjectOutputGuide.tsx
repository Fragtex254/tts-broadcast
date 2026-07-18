import React, { useState } from 'react';
import type { ContentTargetPlatform } from '../../store';
import { ActionButton } from '../ui/ActionButton';
import { WorkbenchCard } from '../ui/WorkbenchCard';

interface ProjectOutputGuideProps {
  hasMasterRevision: boolean;
  masterRevisionNumber?: number;
  masterContent?: string;
  fileName?: string;
  targetPlatform: ContentTargetPlatform;
  contentFormat: string;
  hasAudioScriptRevision: boolean;
  isAudioScriptDifferentFromMaster: boolean;
  hasUnsavedChanges: boolean;
  isPreparing: boolean;
  error: string | null;
  onContinue: () => void;
  onSyncMaster: () => void;
}

export const ProjectOutputGuide: React.FC<ProjectOutputGuideProps> = ({
  hasMasterRevision,
  masterRevisionNumber,
  masterContent = '',
  fileName = '内容主稿',
  targetPlatform,
  contentFormat,
  hasAudioScriptRevision,
  isAudioScriptDifferentFromMaster,
  hasUnsavedChanges,
  isPreparing,
  error,
  onContinue,
  onSyncMaster,
}) => {
  const primaryLabel = hasAudioScriptRevision ? '继续口播稿' : '准备口播版本';
  const [textActionStatus, setTextActionStatus] = useState<string | null>(null);
  const [textActionError, setTextActionError] = useState<string | null>(null);
  const outputDisabled = !hasMasterRevision || hasUnsavedChanges;
  const platformLabel: Record<ContentTargetPlatform, string> = {
    general: '通用内容',
    xiaohongshu: '小红书',
    wechat: '公众号',
    twitter: 'Twitter',
  };

  const handleCopy = async () => {
    setTextActionStatus(null);
    setTextActionError(null);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('当前浏览器不支持自动复制');
      await navigator.clipboard.writeText(masterContent);
      setTextActionStatus('主稿已复制，可直接粘贴到发布平台。');
    } catch (copyError) {
      setTextActionError(copyError instanceof Error ? copyError.message : '复制主稿失败');
    }
  };

  const handleDownload = () => {
    setTextActionStatus(null);
    setTextActionError(null);
    try {
      const blob = new Blob([masterContent], { type: 'text/markdown;charset=utf-8' });
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      const safeName = fileName.trim().replace(/[\\/:*?"<>|]/g, '-') || '内容主稿';
      anchor.href = href;
      anchor.download = `${safeName}.md`;
      anchor.hidden = true;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 0);
      setTextActionStatus('Markdown 文件已下载。');
    } catch (downloadError) {
      setTextActionError(downloadError instanceof Error ? downloadError.message : '下载主稿失败');
    }
  };

  return (
    <WorkbenchCard as="aside" tone="secondary" className="p-5" aria-labelledby="project-output-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blush" />
            <h2 id="project-output-title" className="ui-section-title">输出准备</h2>
          </div>
          <span className="mt-3 inline-flex rounded-full bg-blush/25 px-2.5 py-1 font-body text-[11px] text-ink">04 输出</span>
        </div>
        {hasMasterRevision && (
          <span className="rounded-full border border-card-border bg-white/55 px-3 py-1.5 font-body text-[11px] text-ink-soft">
            主稿第 {masterRevisionNumber} 版
          </span>
        )}
      </div>

      <p className="ui-body mt-4 text-ink-soft/80">
        主稿本身就是可发布的文字资产；音频只是按需生成的派生版本，不是每个内容项目的必经终点。
      </p>

      <div className="mt-4 rounded-2xl border border-card-border bg-white/55 p-4">
        <h3 className="ui-section-title text-ink">文字成稿</h3>
        <p className="ui-body mt-1 text-ink-soft/70">
          {hasMasterRevision
            ? `已保存 · 主稿第 ${masterRevisionNumber} 版 · ${platformLabel[targetPlatform]} · ${contentFormat.trim() || '未指定内容形态'}`
            : '保存首版主稿后，可复制原文或下载 Markdown。'}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton tone="secondary" disabled={outputDisabled} onClick={() => void handleCopy()}>
            复制主稿
          </ActionButton>
          <ActionButton tone="ghost" disabled={outputDisabled} onClick={handleDownload}>
            下载 Markdown
          </ActionButton>
        </div>
        {textActionStatus && <p role="status" className="mt-3 rounded-xl bg-sage/20 p-3 font-body text-[12px] text-ink">{textActionStatus}</p>}
        {textActionError && <p role="alert" className="mt-3 rounded-xl bg-pink/10 p-3 font-body text-[12px] text-ink">{textActionError}</p>}
      </div>

      <div className="mt-4 rounded-2xl border border-card-border bg-white/55 p-4">
        <h3 className="ui-section-title text-ink">音频口播（可选）</h3>
        <p className="ui-control-label mt-3 text-ink">
          {hasAudioScriptRevision ? '继续已有口播版本' : '从当前主稿开始'}
        </p>
        <p className="ui-body mt-1 text-ink-soft/70">
          {hasMasterRevision
            ? hasAudioScriptRevision
              ? '默认打开创作者最后编辑的口播稿；需要重新采用主稿时，请显式建立新版本。'
              : '先复制主稿原文为口播首版，再在编辑器里做口语化调整。'
            : '先在上方保存一版主稿，才能准备可追溯的口播版本。'}
        </p>

        {hasUnsavedChanges && (
          <p role="alert" className="mt-3 rounded-xl border border-lemon/40 bg-lemon/15 p-3 font-body text-[12px] text-ink-soft">
            先保存上方修改，再准备输出。
          </p>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[12px] text-ink">
            {error}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            tone="confirm"
            disabled={outputDisabled}
            isLoading={isPreparing}
            loadingLabel="正在准备口播稿…"
            onClick={onContinue}
          >
            {error ? `重试${primaryLabel}` : primaryLabel}
          </ActionButton>
          {hasMasterRevision && hasAudioScriptRevision && isAudioScriptDifferentFromMaster && (
            <ActionButton tone="secondary" disabled={isPreparing || hasUnsavedChanges} onClick={onSyncMaster}>
              用当前主稿建立口播新版本
            </ActionButton>
          )}
        </div>
      </div>
    </WorkbenchCard>
  );
};

export default ProjectOutputGuide;
