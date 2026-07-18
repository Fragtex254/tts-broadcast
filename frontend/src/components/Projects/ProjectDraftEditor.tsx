import React, { useEffect, useState } from 'react';
import type { ContentArtifact, ContentArtifactRevision } from '../../store';
import { ActionButton } from '../ui/ActionButton';
import { EmptyState } from '../ui/EmptyState';
import { WorkbenchCard } from '../ui/WorkbenchCard';

interface DraftSaveInput {
  title: string;
  content: string;
  changeReason: string;
}

interface ProjectDraftEditorProps {
  artifact: ContentArtifact | null;
  revisions: ContentArtifactRevision[];
  isSaving: boolean;
  saveError: string | null;
  isLoadingRevisions: boolean;
  revisionsError: string | null;
  onSave: (data: DraftSaveInput) => Promise<void>;
  onLoadRevisions: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
}

type LocalSaveStatus = 'idle' | 'saved' | 'error';

export const ProjectDraftEditor: React.FC<ProjectDraftEditorProps> = ({
  artifact,
  revisions,
  isSaving,
  saveError,
  isLoadingRevisions,
  revisionsError,
  onSave,
  onLoadRevisions,
  onDirtyChange,
}) => {
  const [title, setTitle] = useState(artifact?.title || '主稿');
  const [content, setContent] = useState(artifact?.current_revision?.content || '');
  const [changeReason, setChangeReason] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<LocalSaveStatus>('idle');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [previewRevisionId, setPreviewRevisionId] = useState<number | null>(null);
  const baselineTitle = artifact?.title || '主稿';
  const baselineContent = artifact?.current_revision?.content || '';
  const isDirty = title !== baselineTitle || content !== baselineContent;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleSave = async () => {
    if (!title.trim() || (!artifact && !content.trim())) {
      setLocalError('请填写稿件标题和正文');
      setSaveStatus('error');
      return;
    }
    setLocalError(null);
    setSaveStatus('idle');
    try {
      await onSave({ title: title.trim(), content, changeReason: changeReason.trim() });
      setChangeReason('');
      setSaveStatus('saved');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '保存稿件版本失败');
      setSaveStatus('error');
    }
  };

  const handleHistory = async () => {
    const nextOpen = !isHistoryOpen;
    setIsHistoryOpen(nextOpen);
    if (nextOpen && artifact) {
      try {
        await onLoadRevisions();
      } catch {
        // Store owns the recoverable error; the history region renders it below.
      }
    }
  };

  const loadRevisionIntoEditor = (revision: ContentArtifactRevision) => {
    setContent(revision.content);
    setChangeReason(`基于第 ${revision.revision_number} 版继续编辑`);
    setSaveStatus('idle');
    setLocalError(null);
  };

  const inputClass = 'mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] text-ink outline-none transition-colors focus-visible:border-lilac focus-visible:ring-2 focus-visible:ring-lilac/35';

  return (
    <WorkbenchCard className="p-5" aria-labelledby="project-draft-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sage" />
            <h2 id="project-draft-title" className="ui-section-title">主稿与版本</h2>
          </div>
          <p className="ui-body mt-2 text-ink-soft/75">正文只在显式保存时形成版本，输入过程中不会覆盖上一版。</p>
        </div>
        <span className="rounded-full bg-sage/25 px-2.5 py-1 font-body text-[11px] text-ink">03 写作</span>
      </div>

      {!artifact && (
        <EmptyState
          className="mt-5"
          title="还没有主稿"
          description="来源不必全部收集完才开始写；先写下你的核心判断，再逐步补证据。"
        />
      )}

      <div className="mt-5 space-y-4">
        <label htmlFor="artifact-title" className="ui-control-label block text-ink-soft">
          稿件标题
          <input
            id="artifact-title"
            value={title}
            disabled={Boolean(artifact) || isSaving}
            onChange={(event) => { setTitle(event.target.value); setSaveStatus('idle'); }}
            className={`${inputClass} disabled:cursor-not-allowed disabled:bg-paper/60 disabled:text-ink-soft/65`}
          />
        </label>
        <label htmlFor="artifact-content" className="ui-control-label block text-ink-soft">
          主稿正文
          <textarea
            id="artifact-content"
            rows={16}
            value={content}
            disabled={isSaving}
            onChange={(event) => { setContent(event.target.value); setSaveStatus('idle'); }}
            placeholder="从你真正想表达的一句话开始。"
            className={`${inputClass} ui-reading-body min-h-80 resize-y bg-white/80 disabled:cursor-wait disabled:opacity-65`}
          />
        </label>
        <label htmlFor="artifact-reason" className="ui-control-label block text-ink-soft">
          本次修改说明（可选）
          <input
            id="artifact-reason"
            value={changeReason}
            disabled={isSaving}
            onChange={(event) => setChangeReason(event.target.value)}
            placeholder={artifact ? '例如：补充反例并收紧结论' : '例如：建立第一版主稿'}
            className={`${inputClass} disabled:cursor-wait disabled:opacity-65`}
          />
        </label>
      </div>

      {(localError || saveError) && <p role="alert" className="mt-4 animate-shake rounded-xl bg-pink/10 p-3 ui-body text-ink">{localError || saveError}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {artifact && (
            <ActionButton tone="secondary" size="sm" aria-expanded={isHistoryOpen} onClick={() => void handleHistory()}>
              {isHistoryOpen ? '收起版本记录' : '查看版本记录'}
            </ActionButton>
          )}
          <span aria-live="polite" className="ui-metadata text-ink-soft/70">
            {isDirty ? '有未保存修改' : saveStatus === 'saved' ? '新版本已保存' : artifact?.current_revision ? `当前为第 ${artifact.current_revision.revision_number} 版` : '尚未保存版本'}
          </span>
        </div>
        <ActionButton tone="confirm" isLoading={isSaving} loadingLabel="正在保存版本…" onClick={() => void handleSave()}>
          {artifact ? '保存为新版本' : '建立第一版主稿'}
        </ActionButton>
      </div>

      {isHistoryOpen && (
        <div className="mt-4 rounded-2xl border border-card-border bg-white/45 p-4">
          <h3 className="ui-section-title">版本记录</h3>
          {isLoadingRevisions ? (
            <div aria-label="正在加载版本记录" className="mt-3 space-y-2 animate-pulse">
              {[1, 2].map((item) => <div key={item} className="h-12 rounded-xl bg-ink/5" />)}
            </div>
          ) : revisionsError ? (
            <div role="alert" className="mt-3 animate-shake rounded-xl bg-pink/10 p-3 ui-body text-ink">
              <p>{revisionsError}</p>
              <ActionButton tone="secondary" size="sm" className="mt-2" onClick={() => void onLoadRevisions()}>重新加载版本</ActionButton>
            </div>
          ) : revisions.length === 0 ? (
            <p className="ui-body mt-3 text-ink-soft/70">还没有可查看的历史版本。</p>
          ) : (
            <ol className="mt-3 divide-y divide-card-border">
              {revisions.map((revision) => (
                <li key={revision.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="ui-control-label text-ink">第 {revision.revision_number} 版</p>
                      <p className="ui-body mt-1 text-ink-soft/75">{revision.change_reason || '未填写修改说明'}</p>
                    </div>
                    <time className="ui-metadata text-ink-soft/65">{new Date(revision.created_at).toLocaleString('zh-CN')}</time>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <ActionButton tone="ghost" size="sm" onClick={() => setPreviewRevisionId((current) => current === revision.id ? null : revision.id)}>
                      {previewRevisionId === revision.id ? '收起内容' : '查看内容'}
                    </ActionButton>
                    <ActionButton tone="secondary" size="sm" onClick={() => loadRevisionIntoEditor(revision)}>
                      载入到编辑区
                    </ActionButton>
                  </div>
                  {previewRevisionId === revision.id && (
                    <div className="mt-3 whitespace-pre-wrap rounded-xl border border-card-border bg-paper/55 p-3 ui-reading-body text-ink">{revision.content}</div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </WorkbenchCard>
  );
};

export default ProjectDraftEditor;
