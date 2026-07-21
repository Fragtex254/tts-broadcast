import React, { useEffect, useRef, useState } from 'react';
import type { ContentArtifact, ContentArtifactRevision, ContentEvidence, ContentSourceFragment } from '../../store';
import { ActionButton } from '../ui/ActionButton';
import { EmptyState } from '../ui/EmptyState';
import { WorkbenchCard } from '../ui/WorkbenchCard';
import { ProjectCitationPanel } from './ProjectCitationPanel';
import { isAiGeneratedRevision } from './projectRevisionModel';

interface DraftSaveInput {
  title: string;
  content: string;
  changeReason: string;
  parentRevisionId: number | null;
}

interface ProjectDraftEditorProps {
  artifact: ContentArtifact | null;
  revisions: ContentArtifactRevision[];
  isSaving: boolean;
  isGenerationActive?: boolean;
  saveError: string | null;
  isLoadingRevisions: boolean;
  revisionsError: string | null;
  onSave: (data: DraftSaveInput) => Promise<void>;
  onLoadRevisions: () => Promise<void>;
  onDirtyChange?: (dirty: boolean) => void;
  evidence?: ContentEvidence[];
  onFetchFragments?: (sourceId: number) => Promise<ContentSourceFragment[]>;
}

type LocalSaveStatus = 'idle' | 'saved' | 'error';

export const ProjectDraftEditor: React.FC<ProjectDraftEditorProps> = ({
  artifact,
  revisions,
  isSaving,
  isGenerationActive = false,
  saveError,
  isLoadingRevisions,
  revisionsError,
  onSave,
  onLoadRevisions,
  onDirtyChange,
  evidence = [],
  onFetchFragments,
}) => {
  const [title, setTitle] = useState(artifact?.title || '主稿');
  const [content, setContent] = useState(artifact?.current_revision?.content || '');
  const [changeReason, setChangeReason] = useState('');
  const [parentRevisionId, setParentRevisionId] = useState<number | null>(artifact?.current_revision?.id ?? null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<LocalSaveStatus>('idle');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [previewRevisionId, setPreviewRevisionId] = useState<number | null>(null);
  const [inspectionRevisionId, setInspectionRevisionId] = useState<number | null>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const baselineTitle = artifact?.title || '主稿';
  const baselineContent = artifact?.current_revision?.content || '';
  const baselineParentRevisionId = artifact?.current_revision?.id ?? null;
  const isDirty = title !== baselineTitle
    || content !== baselineContent
    || Boolean(changeReason.trim())
    || parentRevisionId !== baselineParentRevisionId;
  const isAiDraft = isAiGeneratedRevision(artifact?.current_revision);
  const isEditingLocked = isSaving || isGenerationActive;

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
      await onSave({ title: title.trim(), content, changeReason: changeReason.trim(), parentRevisionId });
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
    setParentRevisionId(revision.id);
    setChangeReason(`基于第 ${revision.revision_number} 版继续编辑`);
    setSaveStatus('idle');
    setLocalError(null);
  };

  const insertEvidenceMarker = (evidenceId: number) => {
    const marker = `[证据#${evidenceId}]`;
    const textarea = contentRef.current;
    const start = textarea?.selectionStart ?? content.length;
    const end = textarea?.selectionEnd ?? start;
    const nextContent = `${content.slice(0, start)}${marker}${content.slice(end)}`;
    setContent(nextContent);
    setSaveStatus('idle');
    window.requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(start + marker.length, start + marker.length);
    });
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

      {isAiDraft && (
        <div className="mt-4 rounded-2xl border border-lemon/45 bg-lemon/15 p-4">
          <p className="ui-control-label text-ink">AI 草案待确认</p>
          <p className="ui-body mt-1 text-ink-soft/80">先审阅和修改；只有你再次显式保存形成一版人工 Revision 后，才开放复制、下载和口播准备。</p>
        </div>
      )}
      {isGenerationActive && (
        <p role="status" className="mt-4 rounded-xl border border-lilac/35 bg-lilac/10 p-3 ui-body text-ink">
          主稿生成期间已锁定编辑区，避免任务完成时覆盖本地输入；任务收口后即可继续。
        </p>
      )}

      <div className="mt-5 space-y-4">
        <label htmlFor="artifact-title" className="ui-control-label block text-ink-soft">
          稿件标题
          <input
            id="artifact-title"
            value={title}
            disabled={Boolean(artifact) || isEditingLocked}
            onChange={(event) => { setTitle(event.target.value); setSaveStatus('idle'); }}
            className={`${inputClass} disabled:cursor-not-allowed disabled:bg-paper/60 disabled:text-ink-soft/65`}
          />
        </label>
        <label htmlFor="artifact-content" className="ui-control-label block text-ink-soft">
          主稿正文
          <textarea
            ref={contentRef}
            id="artifact-content"
            rows={16}
            value={content}
            disabled={isEditingLocked}
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
            disabled={isEditingLocked}
            onChange={(event) => setChangeReason(event.target.value)}
            placeholder={artifact ? '例如：补充反例并收紧结论' : '例如：建立第一版主稿'}
            className={`${inputClass} disabled:cursor-wait disabled:opacity-65`}
          />
        </label>
      </div>

      {evidence.length > 0 && (
        <section className="mt-4 rounded-2xl border border-sage/35 bg-sage/10 p-4" aria-labelledby="master-evidence-palette-title">
          <h3 id="master-evidence-palette-title" className="ui-section-title text-ink">可用证据引用</h3>
          <p className="ui-body mt-1 text-ink-soft/75">把合法标记插入光标位置；保存时后端会再次核验并固化引用快照，不需要记忆证据 ID。</p>
          <ol className="mt-3 divide-y divide-card-border">
            {evidence.filter((item) => item.reuse_eligible).map((item) => (
              <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="ui-control-label text-ink">证据 #{item.id} · {item.source_title}</p>
                    <p className="ui-metadata mt-1 text-ink-soft/65">原文摘录（未核验）</p>
                    <blockquote className="mt-1 border-l-2 border-sage pl-3 ui-reading-body text-ink-soft/85">{item.excerpt}</blockquote>
                    {item.user_note && <p className="ui-metadata mt-1 text-ink-soft/70">创作者判断：{item.user_note}</p>}
                  </div>
                  <ActionButton
                    size="sm"
                    tone="secondary"
                    disabled={isEditingLocked}
                    aria-label={`在主稿中插入证据 #${item.id} 引用`}
                    onClick={() => insertEvidenceMarker(item.id)}
                  >
                    在光标处插入引用
                  </ActionButton>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

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
        <ActionButton tone="confirm" disabled={isGenerationActive} isLoading={isSaving} loadingLabel="正在保存版本…" onClick={() => void handleSave()}>
          {isAiDraft ? '确认并保存为人工版本' : artifact ? '保存为新版本' : '建立第一版主稿'}
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
                    <ActionButton tone="secondary" size="sm" disabled={isEditingLocked} onClick={() => loadRevisionIntoEditor(revision)}>
                      载入到编辑区
                    </ActionButton>
                    {onFetchFragments && (
                      <ActionButton
                        tone="secondary"
                        size="sm"
                        aria-expanded={inspectionRevisionId === revision.id}
                        aria-label={`核验第 ${revision.revision_number} 版依据`}
                        onClick={() => setInspectionRevisionId((current) => current === revision.id ? null : revision.id)}
                      >
                        {inspectionRevisionId === revision.id ? '收起依据核验' : '核验本版依据'}
                      </ActionButton>
                    )}
                  </div>
                  {previewRevisionId === revision.id && (
                    <div className="mt-3 whitespace-pre-wrap rounded-xl border border-card-border bg-paper/55 p-3 ui-reading-body text-ink">{revision.content}</div>
                  )}
                  {inspectionRevisionId === revision.id && onFetchFragments && (
                    <div className="mt-3">
                      <ProjectCitationPanel
                        revision={revision}
                        onFetchFragments={onFetchFragments}
                        isHistoricalRevision
                      />
                    </div>
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
