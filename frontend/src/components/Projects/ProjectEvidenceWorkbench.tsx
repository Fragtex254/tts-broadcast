import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ContentEvidence,
  ContentEvidenceInput,
  ContentEvidenceUpdateInput,
  ContentGenerationJob,
  ContentProjectSource,
  ContentSourceFragment,
} from '../../store';
import { ActionButton } from '../ui/ActionButton';
import { EmptyState } from '../ui/EmptyState';
import { TaskProgress } from '../ui/TaskProgress';
import { WorkbenchCard } from '../ui/WorkbenchCard';

interface ProjectEvidenceWorkbenchProps {
  sources: ContentProjectSource[];
  evidence: ContentEvidence[];
  fragmentsBySource: Record<number, ContentSourceFragment[]>;
  isLoadingFragments: boolean;
  fragmentsError: string | null;
  activeJob: ContentGenerationJob | null;
  activeOperation: ContentGenerationJob['operation'] | null;
  error: string | null;
  hasUnsavedBrief?: boolean;
  onFetchFragments: (sourceId: number) => Promise<ContentSourceFragment[]>;
  onCreateManual: (data: ContentEvidenceInput) => Promise<ContentEvidence>;
  onUpdate: (evidenceId: number, data: ContentEvidenceUpdateInput) => Promise<ContentEvidence>;
  onStartExtraction: (sourceIds: number[]) => Promise<unknown> | void;
  onDirtyChange?: (dirty: boolean) => void;
}

const PHASE_LABEL: Record<string, string> = {
  queued: '候选证据已排队',
  reading_sources: '正在读取已授权来源',
  extracting: '正在提取候选证据',
  validating: '正在校验候选与原文范围',
  completed: '候选证据提取完成',
  failed: '候选证据提取失败',
};

const inputClass = 'mt-1 w-full rounded-xl border border-card-border bg-white/75 px-3.5 py-2.5 font-body text-[12px] text-ink outline-none transition-colors focus-visible:border-lilac focus-visible:ring-2 focus-visible:ring-lilac/35';

function evidenceStatusLabel(item: ContentEvidence): string {
  if (item.lifecycle_status !== 'active') {
    if (item.decision_state === 'selected') return '曾采用 · 当前不可复用';
    if (item.decision_state === 'rejected') return '曾驳回 · 当前不可复用';
    return '候选 · 当前不可复用';
  }
  if (item.decision_state === 'selected') return '已采用';
  if (item.decision_state === 'rejected') return '已驳回';
  return '待判断';
}

function unavailableMessage(item: ContentEvidence): string {
  if (item.lifecycle_status === 'superseded') return '这张旧卡已被修正后的新证据替代。历史决定和摘录仍保留，新生成不会再使用它。';
  if (!item.source_linked) return '来源已移出项目。历史采用/驳回决定会保留，但新生成不会使用这条证据。';
  if (!item.source_snapshot_intact) return '来源原文完整性已变化。历史决定会保留，请重新定位后再用于新生成。';
  return '证据当前不可复用。历史采用/驳回决定会保留，但新生成不会使用它。';
}

interface EvidenceItemProps {
  item: ContentEvidence;
  isPending: boolean;
  onUpdate: ProjectEvidenceWorkbenchProps['onUpdate'];
  onPendingChange: (id: number | null) => void;
  onError: (message: string | null) => void;
  onDirtyState: (id: number, dirty: boolean) => void;
  onCorrect: (item: ContentEvidence) => void;
}

const EvidenceItem: React.FC<EvidenceItemProps> = ({ item, isPending, onUpdate, onPendingChange, onError, onDirtyState, onCorrect }) => {
  const [note, setNote] = useState(item.user_note);
  const canDecide = item.lifecycle_status === 'active' && item.source_linked && item.source_snapshot_intact;
  const isDirty = note !== item.user_note;

  useEffect(() => {
    onDirtyState(item.id, isDirty);
    return () => onDirtyState(item.id, false);
  }, [isDirty, item.id, onDirtyState]);

  const update = async (data: ContentEvidenceUpdateInput) => {
    onPendingChange(item.id);
    onError(null);
    try {
      await onUpdate(item.id, data);
    } catch (error) {
      onError(error instanceof Error ? error.message : '更新证据失败');
    } finally {
      onPendingChange(null);
    }
  };

  return (
    <li className={`rounded-2xl border p-4 ${canDecide ? 'border-card-border bg-white/65' : 'border-lemon/45 bg-lemon/10'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full bg-sage/25 px-2 py-0.5 font-body text-[11px] text-ink-soft">{item.source_title}</span>
          <span className="rounded-full bg-lilac/20 px-2 py-0.5 font-body text-[11px] text-ink-soft">{item.origin === 'ai' ? 'AI 候选' : '人工定位'}</span>
        </div>
        <span className="rounded-full bg-white/75 px-2 py-0.5 font-body text-[11px] text-ink-soft">{evidenceStatusLabel(item)}</span>
      </div>

      {item.origin === 'ai' && (
        <div className="mt-3">
          <p className="ui-metadata font-medium text-ink-soft">AI 提取说明（不是来源事实）</p>
          <p className="ui-body mt-1 text-ink-soft/80">{item.ai_note || 'AI 未提供提取说明，请直接核对原文。'}</p>
        </div>
      )}
      <div className="mt-3">
        <p className="ui-metadata font-medium text-ink-soft">原文摘录（未核验）</p>
        <blockquote className="mt-1 border-l-2 border-sage pl-3 ui-reading-body text-ink">{item.excerpt}</blockquote>
        <p className="ui-metadata mt-1 text-ink-soft/65">原文片段 {item.start_fragment_index + 1}–{item.end_fragment_index + 1}</p>
      </div>
      {!canDecide && (
        <p className="mt-3 rounded-xl bg-lemon/20 p-3 ui-body text-ink-soft">{unavailableMessage(item)}</p>
      )}

      <label className="ui-control-label mt-3 block text-ink-soft">
        创作者判断（由你填写）
        <textarea
          rows={2}
          value={note}
          disabled={!canDecide || isPending}
          onChange={(event) => setNote(event.target.value)}
          placeholder="记录你的经验、质疑或使用方式；AI 不会替你编造。"
          className={`${inputClass} resize-y disabled:cursor-not-allowed disabled:opacity-60`}
        />
      </label>
      <p className="ui-metadata mt-1 text-ink-soft/65">这条创作者判断只保存在项目里供你核对，本阶段不会发送给外部模型。</p>
      {canDecide && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap gap-2">
            <ActionButton size="sm" tone="secondary" disabled={isPending || note === item.user_note} onClick={() => void update({ userNote: note })}>
              保存创作者判断
            </ActionButton>
            <ActionButton size="sm" tone="secondary" disabled={isPending} onClick={() => onCorrect(item)}>修正原文范围</ActionButton>
          </div>
          <div className="flex flex-wrap gap-2">
            {item.decision_state === 'candidate' && (
              <>
                <ActionButton size="sm" tone="ghost" disabled={isPending} onClick={() => void update({ state: 'rejected' })}>暂不使用</ActionButton>
                <ActionButton size="sm" tone="confirm" disabled={isPending} onClick={() => void update({ state: 'selected' })}>采用这条证据</ActionButton>
              </>
            )}
            {item.decision_state === 'selected' && (
              <ActionButton size="sm" tone="secondary" disabled={isPending} onClick={() => void update({ state: 'candidate' })}>取消采用</ActionButton>
            )}
            {item.decision_state === 'rejected' && (
              <ActionButton size="sm" tone="secondary" disabled={isPending} onClick={() => void update({ state: 'candidate' })}>重新考虑</ActionButton>
            )}
          </div>
        </div>
      )}
    </li>
  );
};

export const ProjectEvidenceWorkbench: React.FC<ProjectEvidenceWorkbenchProps> = ({
  sources,
  evidence,
  fragmentsBySource,
  isLoadingFragments,
  fragmentsError,
  activeJob,
  activeOperation,
  error,
  hasUnsavedBrief = false,
  onFetchFragments,
  onCreateManual,
  onUpdate,
  onStartExtraction,
  onDirtyChange,
}) => {
  const [isManualOpen, setIsManualOpen] = useState(false);
  const [sourceId, setSourceId] = useState<number | null>(null);
  const [startIndex, setStartIndex] = useState(0);
  const [endIndex, setEndIndex] = useState(0);
  const [userNote, setUserNote] = useState('');
  const [pendingEvidenceId, setPendingEvidenceId] = useState<number | null>(null);
  const [selectedSourceIds, setSelectedSourceIds] = useState<number[]>([]);
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);
  const [isStartingExtraction, setIsStartingExtraction] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dirtyEvidenceIds, setDirtyEvidenceIds] = useState<Set<number>>(() => new Set());
  const [correctionEvidence, setCorrectionEvidence] = useState<ContentEvidence | null>(null);
  const fragments = sourceId ? fragmentsBySource[sourceId] || [] : [];
  const sourcesWithContent = useMemo(() => sources.filter((source) => Boolean(source.content.trim())), [sources]);
  const selectedCount = useMemo(
    () => evidence.filter((item) => item.reuse_eligible).length,
    [evidence]
  );
  const isManualDirty = isManualOpen && Boolean(sourceId || userNote || startIndex || endIndex);
  const hasUnsavedEvidence = isManualDirty || dirtyEvidenceIds.size > 0;

  const updateEvidenceDirtyState = useCallback((id: number, dirty: boolean) => {
    setDirtyEvidenceIds((current) => {
      const next = new Set(current);
      if (dirty) next.add(id); else next.delete(id);
      if (next.size === current.size && [...next].every((value) => current.has(value))) return current;
      return next;
    });
  }, []);

  useEffect(() => {
    onDirtyChange?.(isManualDirty || dirtyEvidenceIds.size > 0);
  }, [dirtyEvidenceIds, isManualDirty, onDirtyChange]);

  const selectSource = (value: string) => {
    const nextId = Number(value);
    setSourceId(nextId || null);
    setStartIndex(0);
    setEndIndex(0);
    setLocalError(null);
    if (nextId && !fragmentsBySource[nextId]) void onFetchFragments(nextId).catch(() => undefined);
  };

  const saveManualEvidence = async () => {
    if (!sourceId || fragments.length === 0) {
      setLocalError('请先选择来源和原文片段');
      return;
    }
    setIsSubmittingManual(true);
    setLocalError(null);
    try {
      const decisionState = correctionEvidence?.decision_state === 'selected' || !correctionEvidence ? 'selected' : 'candidate';
      const created = await onCreateManual({
        sourceId,
        startFragmentIndex: startIndex,
        endFragmentIndex: endIndex,
        decisionState,
        userNote,
        ...(correctionEvidence ? { supersedesEvidenceId: correctionEvidence.id } : {}),
      });
      if (created.decision_state !== decisionState) throw new Error('证据已保存但决策状态不一致，请刷新后核对');
      setUserNote('');
      setSourceId(null);
      setStartIndex(0);
      setEndIndex(0);
      setCorrectionEvidence(null);
      setIsManualOpen(false);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : '保存手工证据失败');
    } finally {
      setIsSubmittingManual(false);
    }
  };

  const startExtraction = async () => {
    if (hasUnsavedBrief || hasUnsavedEvidence) {
      setLocalError(hasUnsavedBrief ? '请先保存 Brief，再提取候选证据。' : '请先保存证据判断或关闭未完成的手工定位，再提取候选证据。');
      return;
    }
    setIsStartingExtraction(true);
    setLocalError(null);
    try {
      await onStartExtraction(selectedSourceIds);
    } catch (caught) {
      setLocalError(caught instanceof Error ? caught.message : '启动证据提取失败');
    } finally {
      setIsStartingExtraction(false);
    }
  };

  const jobIsActive = activeOperation === 'extract_evidence';

  const toggleSource = (id: number) => {
    setSelectedSourceIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const openManualForm = () => {
    setCorrectionEvidence(null);
    setSourceId(null);
    setStartIndex(0);
    setEndIndex(0);
    setUserNote('');
    setLocalError(null);
    setIsManualOpen((value) => !value);
  };

  const openCorrectionForm = (item: ContentEvidence) => {
    setCorrectionEvidence(item);
    setSourceId(item.source_id);
    setStartIndex(item.start_fragment_index);
    setEndIndex(item.end_fragment_index);
    setUserNote(item.user_note);
    setLocalError(null);
    setIsManualOpen(true);
    if (!fragmentsBySource[item.source_id]) void onFetchFragments(item.source_id).catch(() => undefined);
  };

  return (
    <WorkbenchCard className="p-5" aria-labelledby="project-evidence-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-lilac" />
            <h2 id="project-evidence-title" className="ui-section-title">证据选择</h2>
          </div>
          <p className="ui-body mt-2 text-ink-soft/75">AI 只提候选；是否采用、如何理解，始终由你决定。</p>
        </div>
        <span className="rounded-full bg-sage/25 px-2.5 py-1 font-body text-[11px] text-ink">已采用 {selectedCount} 条</span>
      </div>

      {sourcesWithContent.length > 0 && (
        <fieldset className="mt-4 rounded-2xl border border-card-border bg-white/45 p-4">
          <legend className="ui-control-label px-1 text-ink">明确选择允许发送给外部模型的来源</legend>
          <p className="ui-body mt-1 text-ink-soft/75">默认不发送任何原文。只会读取你在本次操作中勾选的来源；超长材料失败时仍可继续手工定位证据。</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {sourcesWithContent.map((source) => (
              <label key={source.id} className="flex items-start gap-2 rounded-xl border border-card-border bg-white/60 p-3 ui-control-label text-ink">
                <input
                  type="checkbox"
                  aria-label={`允许发送来源：${source.title}`}
                  checked={selectedSourceIds.includes(source.id)}
                  onChange={() => toggleSource(source.id)}
                />
                <span className="min-w-0">
                  <span className="block">{source.title}</span>
                  <span className="ui-metadata mt-0.5 block text-ink-soft/65">{source.content.length.toLocaleString('zh-CN')} 字符 · 用户粘贴材料（未核验）</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton
          size="sm"
          tone="edit"
          disabled={selectedSourceIds.length === 0 || jobIsActive || hasUnsavedBrief || hasUnsavedEvidence}
          isLoading={isStartingExtraction}
          loadingLabel="正在提交…"
          onClick={() => void startExtraction()}
        >
          AI 提取候选证据
        </ActionButton>
        <ActionButton size="sm" tone="secondary" aria-expanded={isManualOpen && !correctionEvidence} disabled={sourcesWithContent.length === 0} onClick={openManualForm}>
          从原文手工定位
        </ActionButton>
      </div>

      {(hasUnsavedBrief || hasUnsavedEvidence) && (
        <div className="mt-3 rounded-xl border border-lemon/40 bg-lemon/15 p-3" aria-label="AI 提取前需要保存的内容">
          <p className="ui-control-label text-ink">保存当前判断后再提取</p>
          {hasUnsavedBrief && <p className="ui-body mt-1 text-ink-soft/80">先保存 Brief，避免模型读取到旧的创作目标。</p>}
          {hasUnsavedEvidence && <p className="ui-body mt-1 text-ink-soft/80">先保存证据判断或修正，避免候选结果与本地草稿交叉。</p>}
        </div>
      )}

      {jobIsActive && activeJob && (
        <TaskProgress
          className="mt-4"
          label={PHASE_LABEL[activeJob.phase] || '候选证据处理中'}
          percent={activeJob.progress ?? undefined}
          tone={activeJob.status === 'failed' ? 'error' : 'working'}
        />
      )}

      {isManualOpen && (
        <div className="mt-4 rounded-2xl border border-card-border bg-white/55 p-4">
          {correctionEvidence && (
            <div className="mb-3 rounded-xl bg-lemon/15 p-3">
              <p className="ui-control-label text-ink">正在修正证据 #{correctionEvidence.id}</p>
              <p className="ui-body mt-1 text-ink-soft/75">保存后会创建一张可追溯的新卡，旧卡只标记为“已被修正”，不会被覆盖或删除。</p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="ui-control-label text-ink-soft sm:col-span-3">
              选择来源
              <select value={sourceId || ''} disabled={Boolean(correctionEvidence)} onChange={(event) => selectSource(event.target.value)} className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-65`}>
                <option value="">请选择原始来源</option>
                {sourcesWithContent.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}
              </select>
            </label>
            <label className="ui-control-label text-ink-soft">
              起始片段
              <select value={startIndex} disabled={!sourceId || isLoadingFragments} onChange={(event) => { const value = Number(event.target.value); setStartIndex(value); setEndIndex((current) => Math.max(current, value)); }} className={inputClass}>
                {fragments.map((fragment) => <option key={fragment.index} value={fragment.index}>片段 {fragment.index + 1} · {fragment.content.replace(/\s+/g, ' ').slice(0, 48)}</option>)}
              </select>
            </label>
            <label className="ui-control-label text-ink-soft">
              结束片段
              <select value={endIndex} disabled={!sourceId || isLoadingFragments} onChange={(event) => setEndIndex(Number(event.target.value))} className={inputClass}>
                {fragments.filter((fragment) => fragment.index >= startIndex).map((fragment) => <option key={fragment.index} value={fragment.index}>片段 {fragment.index + 1} · {fragment.content.replace(/\s+/g, ' ').slice(0, 48)}</option>)}
              </select>
            </label>
            <label className="ui-control-label text-ink-soft sm:col-span-3">
              创作者判断（可选）
              <textarea aria-describedby="manual-evidence-note-privacy" rows={2} value={userNote} onChange={(event) => setUserNote(event.target.value)} className={`${inputClass} resize-y`} />
            </label>
            <p id="manual-evidence-note-privacy" className="ui-metadata text-ink-soft/65 sm:col-span-3">这条创作者判断只保存在项目里供你核对，本阶段不会发送给外部模型。</p>
          </div>
          {fragments.length > 0 && (
            <div className="mt-3 rounded-xl border border-sage/35 bg-sage/10 p-3">
              <p className="ui-metadata text-ink-soft">将保存的原文范围</p>
              <p className="ui-metadata mt-1 text-ink-soft/70">起始：片段 {startIndex + 1} · 结束：片段 {endIndex + 1}</p>
              <p className="ui-reading-body mt-1 whitespace-pre-wrap text-ink">{fragments.filter((fragment) => fragment.index >= startIndex && fragment.index <= endIndex).map((fragment) => fragment.content).join('\n\n')}</p>
            </div>
          )}
          {isLoadingFragments && <p role="status" className="ui-body mt-3 text-ink-soft">正在读取原文片段…</p>}
          <div className="mt-3 flex justify-end">
            <ActionButton tone="confirm" isLoading={isSubmittingManual} loadingLabel="正在保存…" onClick={() => void saveManualEvidence()}>
              {correctionEvidence ? '保存修正后的证据' : '保存并采用证据'}
            </ActionButton>
          </div>
        </div>
      )}

      {(localError || error || fragmentsError) && <p role="alert" className="mt-4 rounded-xl bg-pink/10 p-3 ui-body text-ink">{localError || error || fragmentsError}</p>}

      {evidence.length === 0 ? (
        <EmptyState className="mt-4" title="还没有候选证据" description="你可以让 AI 从已保存来源提取候选，也可以直接从原文手工定位；两条路径都不会修改原始材料。" />
      ) : (
        <ol className="mt-4 space-y-3" aria-live="polite">
          {evidence.map((item) => (
            <EvidenceItem
              key={item.id}
              item={item}
              isPending={pendingEvidenceId === item.id}
              onUpdate={onUpdate}
              onPendingChange={setPendingEvidenceId}
              onError={setLocalError}
              onDirtyState={updateEvidenceDirtyState}
              onCorrect={openCorrectionForm}
            />
          ))}
        </ol>
      )}
    </WorkbenchCard>
  );
};

export default ProjectEvidenceWorkbench;
