import React, { useEffect, useMemo, useState } from 'react';
import type {
  ContentArtifact,
  ContentArtifactRevision,
  ContentCreatorInputKey,
  ContentEvidence,
  ContentGenerationJob,
  ContentProject,
} from '../../store';
import { ActionButton } from '../ui/ActionButton';
import { EmptyState } from '../ui/EmptyState';
import { TaskProgress } from '../ui/TaskProgress';
import { WorkbenchCard } from '../ui/WorkbenchCard';
import { revisionOriginLabel } from './projectRevisionModel';

interface OutlineSaveInput {
  content: string;
  changeReason: string;
}

interface ProjectOutlineEditorProps {
  project: ContentProject;
  artifact: ContentArtifact | null;
  revisions: ContentArtifactRevision[];
  isLoadingRevisions?: boolean;
  revisionsError?: string | null;
  onRetryRevisions?: () => Promise<ContentArtifactRevision[]>;
  selectedEvidence: ContentEvidence[];
  activeJob: ContentGenerationJob | null;
  activeOperation: ContentGenerationJob['operation'] | null;
  isSaving: boolean;
  saveError: string | null;
  jobError: string | null;
  hasUnsavedBrief?: boolean;
  hasUnsavedEvidence?: boolean;
  hasUnsavedMasterDraft?: boolean;
  onSave: (data: OutlineSaveInput) => Promise<void>;
  onGenerateOutline: (evidenceIds: number[], creatorInputKeys: ContentCreatorInputKey[]) => Promise<unknown> | void;
  onGenerateMaster: (outlineRevisionId: number, evidenceIds: number[], creatorInputKeys: ContentCreatorInputKey[]) => Promise<unknown> | void;
  onDirtyChange?: (dirty: boolean) => void;
}

const PHASE_LABEL: Record<string, string> = {
  queued: '创作任务已排队',
  building_context: '正在组装已确认上下文',
  generating_outline: '正在生成可审阅提纲',
  generating_master: '正在生成带引用的主稿',
  validating_citations: '正在校验引用与来源摘录',
  completed: '创作草案已保存为不可变版本',
  failed: '创作任务失败',
};

const inputClass = 'mt-1 w-full rounded-xl border border-card-border bg-white/75 px-3.5 py-2.5 font-body text-[12px] text-ink outline-none transition-colors focus-visible:border-lilac focus-visible:ring-2 focus-visible:ring-lilac/35';

export const ProjectOutlineEditor: React.FC<ProjectOutlineEditorProps> = ({
  project,
  artifact,
  revisions,
  isLoadingRevisions = false,
  revisionsError = null,
  onRetryRevisions,
  selectedEvidence,
  activeJob,
  activeOperation,
  isSaving,
  saveError,
  jobError,
  hasUnsavedBrief = false,
  hasUnsavedEvidence = false,
  hasUnsavedMasterDraft = false,
  onSave,
  onGenerateOutline,
  onGenerateMaster,
  onDirtyChange,
}) => {
  const baselineContent = artifact?.current_revision?.content || '';
  const [content, setContent] = useState(baselineContent);
  const [changeReason, setChangeReason] = useState('');
  const [creatorInputKeys, setCreatorInputKeys] = useState<ContentCreatorInputKey[]>([]);
  const [outlineRevisionId, setOutlineRevisionId] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [startingOperation, setStartingOperation] = useState<ContentGenerationJob['operation'] | null>(null);
  const isDirty = content !== baselineContent || Boolean(changeReason.trim());
  const reusableEvidence = useMemo(
    () => selectedEvidence.filter((item) => item.reuse_eligible),
    [selectedEvidence]
  );
  const availableRevisions = useMemo(() => {
    const current = artifact?.current_revision;
    const items = current ? [current, ...revisions.filter((revision) => revision.id !== current.id)] : revisions;
    return items.sort((a, b) => b.revision_number - a.revision_number);
  }, [artifact?.current_revision, revisions]);
  const isAiDraft = Boolean(artifact?.current_revision?.generation_job_id)
    || artifact?.current_revision?.change_reason === 'ai_generated';
  const jobIsActive = Boolean(activeOperation);
  const isOutlineJobActive = activeOperation === 'generate_outline' || startingOperation === 'generate_outline';
  const selectedOutlineRevision = availableRevisions.find((revision) => revision.id === outlineRevisionId) || null;
  const dirtyGuidance = [
    hasUnsavedBrief ? '先保存 Brief，再启动 AI。' : null,
    hasUnsavedEvidence ? '先保存证据判断或修正，再启动 AI。' : null,
    isDirty ? '先保存提纲草稿，再启动 AI。' : null,
    hasUnsavedMasterDraft ? '先保存主稿草稿，再生成新的主稿草案。' : null,
  ].filter((message): message is string => Boolean(message));

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const toggleCreatorInput = (key: ContentCreatorInputKey) => {
    setCreatorInputKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  const save = async () => {
    if (!content.trim()) {
      setLocalError('请先写下提纲内容');
      return;
    }
    setLocalError(null);
    try {
      await onSave({ content, changeReason: changeReason.trim() });
      setChangeReason('');
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '保存提纲版本失败');
    }
  };

  const startOutline = async () => {
    setStartingOperation('generate_outline');
    setLocalError(null);
    try {
      await onGenerateOutline(reusableEvidence.map((item) => item.id), creatorInputKeys);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '生成提纲草案失败');
    } finally {
      setStartingOperation(null);
    }
  };

  const startMaster = async () => {
    if (!outlineRevisionId) return;
    setStartingOperation('generate_master');
    setLocalError(null);
    try {
      await onGenerateMaster(outlineRevisionId, reusableEvidence.map((item) => item.id), creatorInputKeys);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '生成主稿草案失败');
    } finally {
      setStartingOperation(null);
    }
  };

  return (
    <WorkbenchCard className="p-5" aria-labelledby="project-outline-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-lemon" />
            <h2 id="project-outline-title" className="ui-section-title">提纲与生成上下文</h2>
          </div>
          <p className="ui-body mt-2 text-ink-soft/75">手写提纲始终可用；AI 草案落盘只是待审阅版本，不代表你已经确认。</p>
        </div>
        {artifact?.current_revision && (
          <span className={`rounded-full px-2.5 py-1 font-body text-[11px] text-ink ${isAiDraft ? 'bg-lemon/35' : 'bg-sage/30'}`}>
            {isAiDraft ? 'AI 草案待确认' : `人工保存 · 第 ${artifact.current_revision.revision_number} 版`}
          </span>
        )}
      </div>

      {!artifact && <EmptyState className="mt-4" title="还没有提纲版本" description="可以直接手写并保存第一版，也可以先采用证据后生成一个可审阅草案。" />}

      {isOutlineJobActive && (
        <p role="status" className="mt-4 rounded-xl border border-lilac/35 bg-lilac/10 p-3 ui-body text-ink">
          提纲生成期间已锁定编辑区，避免任务完成时覆盖本地输入；任务收口后即可继续。
        </p>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div>
          <label className="ui-control-label block text-ink-soft">
            提纲正文
            <textarea
              rows={12}
              value={content}
              disabled={isSaving || isOutlineJobActive}
              onChange={(event) => setContent(event.target.value)}
              placeholder="先写核心判断，再安排证据、反例和结论。"
              className={`${inputClass} ui-reading-body min-h-64 resize-y disabled:cursor-wait disabled:opacity-65`}
            />
          </label>
          <label className="ui-control-label mt-3 block text-ink-soft">
            本次修改说明（可选）
            <input value={changeReason} disabled={isSaving || isOutlineJobActive} onChange={(event) => setChangeReason(event.target.value)} className={inputClass} placeholder="例如：加入反例并调整结尾" />
          </label>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span aria-live="polite" className="ui-metadata text-ink-soft/70">{isDirty ? '提纲有未保存修改' : artifact?.current_revision ? `当前为第 ${artifact.current_revision.revision_number} 版` : '尚未保存版本'}</span>
            <ActionButton tone="confirm" disabled={isOutlineJobActive} isLoading={isSaving} loadingLabel="正在保存提纲…" onClick={() => void save()}>
              {artifact ? '保存为新提纲版本' : '建立第一版提纲'}
            </ActionButton>
          </div>
        </div>

        <aside className="rounded-2xl border border-card-border bg-white/50 p-4" aria-label="AI 生成上下文">
          <h3 className="ui-section-title text-ink">这次允许 AI 使用什么</h3>
          <p className="ui-body mt-1 text-ink-soft/75">已采用且仍有效的证据 {reusableEvidence.length} 条。失效证据不会发送。</p>
          <div className="mt-3 space-y-2">
            {project.personal_practice && (
              <label className="block rounded-xl border border-card-border bg-white/60 p-3">
                <span className="flex items-center gap-2 ui-control-label text-ink">
                  <input aria-label="带入个人实践" type="checkbox" disabled={jobIsActive} checked={creatorInputKeys.includes('personal_practice')} onChange={() => toggleCreatorInput('personal_practice')} />
                  带入个人实践
                </span>
                <span className="ui-body mt-1 block text-ink-soft/75">{project.personal_practice}</span>
              </label>
            )}
            {project.personal_judgment && (
              <label className="block rounded-xl border border-card-border bg-white/60 p-3">
                <span className="flex items-center gap-2 ui-control-label text-ink">
                  <input aria-label="带入个人判断" type="checkbox" disabled={jobIsActive} checked={creatorInputKeys.includes('personal_judgment')} onChange={() => toggleCreatorInput('personal_judgment')} />
                  带入个人判断
                </span>
                <span className="ui-body mt-1 block text-ink-soft/75">{project.personal_judgment}</span>
              </label>
            )}
          </div>
          <p className="ui-metadata mt-2 text-ink-soft/65">未勾选的个人内容不会发送给模型；证据卡中的创作者判断也只供你核对，本阶段不会发送。AI 不得补写不存在的个人经历。</p>
          {dirtyGuidance.length > 0 && (
            <div className="mt-3 rounded-xl border border-lemon/40 bg-lemon/15 p-3" aria-label="AI 生成前需要保存的内容">
              <p className="ui-control-label text-ink">保存后再继续相应生成</p>
              <ul className="mt-1 space-y-1 ui-body text-ink-soft/80">
                {dirtyGuidance.map((message) => <li key={message}>{message}</li>)}
              </ul>
            </div>
          )}
          <ActionButton
            className="mt-3 w-full"
            size="sm"
            tone="edit"
            disabled={reusableEvidence.length === 0 || jobIsActive || hasUnsavedBrief || hasUnsavedEvidence || isDirty}
            isLoading={startingOperation === 'generate_outline'}
            loadingLabel="正在提交…"
            onClick={() => void startOutline()}
          >
            生成可审阅提纲草案
          </ActionButton>

          <div className="mt-4 border-t border-card-border pt-4">
            <label className="ui-control-label block text-ink-soft">
              用于生成主稿的提纲版本
              <select value={outlineRevisionId || ''} disabled={jobIsActive} onChange={(event) => setOutlineRevisionId(Number(event.target.value) || null)} className={inputClass}>
                <option value="">{isLoadingRevisions ? '正在加载版本…' : '请显式选择一个版本'}</option>
                {availableRevisions.map((revision) => <option key={revision.id} value={revision.id}>第 {revision.revision_number} 版 · {revision.change_reason || '手工保存'}</option>)}
              </select>
            </label>
            {selectedOutlineRevision && (
              <section aria-label="已选提纲版本预览" className="mt-3 rounded-xl border border-lilac/35 bg-lilac/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="ui-control-label text-ink">第 {selectedOutlineRevision.revision_number} 版 · {revisionOriginLabel(selectedOutlineRevision)}</p>
                  <time className="ui-metadata text-ink-soft/65">{new Date(selectedOutlineRevision.created_at).toLocaleString('zh-CN')}</time>
                </div>
                <p className="ui-metadata mt-1 text-ink-soft/70">{selectedOutlineRevision.change_reason || '未填写修改说明'} · 不可变 Revision #{selectedOutlineRevision.id}</p>
                <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg bg-white/60 p-3 ui-reading-body text-ink">
                  {selectedOutlineRevision.content}
                </div>
                {selectedOutlineRevision.provenance.origin === 'ai' && (
                  <p className="ui-metadata mt-2 text-ink-soft/70">AI 生成记录：{selectedOutlineRevision.provenance.provider || '未记录提供方'} / {selectedOutlineRevision.provenance.model || '未记录模型'} · Prompt {selectedOutlineRevision.provenance.prompt_version || '未记录'}</p>
                )}
              </section>
            )}
            {revisionsError && (
              <div role="alert" className="mt-2 rounded-xl bg-pink/10 p-2 ui-body text-ink">
                {revisionsError}
                {onRetryRevisions && <ActionButton className="mt-2" size="sm" tone="secondary" onClick={() => void onRetryRevisions()}>重新加载提纲版本</ActionButton>}
              </div>
            )}
            <p className="ui-metadata mt-2 text-ink-soft/65">选择确切 Revision 才表示你确认以这版结构继续；后续提纲变化不会静默替换它。</p>
            <ActionButton
              className="mt-3 w-full"
              size="sm"
              tone="primary"
              disabled={!outlineRevisionId || reusableEvidence.length === 0 || jobIsActive || isDirty || hasUnsavedBrief || hasUnsavedEvidence || hasUnsavedMasterDraft}
              isLoading={startingOperation === 'generate_master'}
              loadingLabel="正在提交…"
              onClick={() => void startMaster()}
            >
              生成带引用的主稿草案
            </ActionButton>
          </div>
        </aside>
      </div>

      {activeJob && activeOperation && (
        <TaskProgress
          className="mt-4"
          label={PHASE_LABEL[activeJob.phase] || '正在处理创作任务'}
          percent={activeJob.progress ?? undefined}
          tone={activeJob.status === 'failed' ? 'error' : 'working'}
        />
      )}
      {(localError || saveError || jobError) && <p role="alert" className="mt-4 rounded-xl bg-pink/10 p-3 ui-body text-ink">{localError || saveError || jobError}</p>}
    </WorkbenchCard>
  );
};

export default ProjectOutlineEditor;
