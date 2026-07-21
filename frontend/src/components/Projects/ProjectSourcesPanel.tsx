import React, { useEffect, useState } from 'react';
import type { ContentProject, ContentProjectSource, ContentProjectSourceInput } from '../../store';
import { ModalShell } from '../ModalShell';
import { ActionButton } from '../ui/ActionButton';
import { EmptyState } from '../ui/EmptyState';
import { WorkbenchCard } from '../ui/WorkbenchCard';

interface ProjectSourcesPanelProps {
  sources: ContentProjectSource[];
  claims?: ContentProject['claims'];
  isSaving: boolean;
  saveError: string | null;
  onAdd: (data: ContentProjectSourceInput) => Promise<ContentProjectSource>;
  onContinueResearch?: () => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onUnlink?: (sourceId: number) => Promise<void>;
}

const isSafeWebUrl = (value: string) => {
  if (!value.trim()) return true;
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const SOURCE_PREVIEW_LENGTH = 280;

export const ProjectSourcesPanel: React.FC<ProjectSourcesPanelProps> = ({
  sources,
  claims = [],
  isSaving,
  saveError,
  onAdd,
  onContinueResearch,
  onDirtyChange,
  onUnlink,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [usageNote, setUsageNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(sources.length === 0);
  const [successMessage, setSuccessMessage] = useState('');
  const [previewSource, setPreviewSource] = useState<ContentProjectSource | null>(null);
  const [sourceToUnlink, setSourceToUnlink] = useState<ContentProjectSource | null>(null);
  const [isUnlinking, setIsUnlinking] = useState(false);
  const [unlinkError, setUnlinkError] = useState<string | null>(null);

  const isDirty = Boolean(title || content || url || usageNote);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleAdd = async () => {
    if (!title.trim() || !content.trim()) {
      setLocalError('请填写原文标题并粘贴原文内容');
      return;
    }
    if (!isSafeWebUrl(url)) {
      setLocalError('原始链接必须以 http:// 或 https:// 开头');
      return;
    }
    setLocalError(null);
    setSuccessMessage('');
    try {
      await onAdd({
        sourceType: 'manual',
        title: title.trim(),
        content,
        url: url.trim(),
        usageNote: usageNote.trim(),
      });
      setTitle('');
      setContent('');
      setUrl('');
      setUsageNote('');
      setSuccessMessage('用户粘贴的原文快照已加入项目；材料与链接仍保持“未核验”状态。');
      setIsFormOpen(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '添加来源失败');
    }
  };

  const handleUnlink = async () => {
    if (!sourceToUnlink || !onUnlink) return;
    setIsUnlinking(true);
    setUnlinkError(null);
    try {
      await onUnlink(sourceToUnlink.id);
      setSourceToUnlink(null);
    } catch (error) {
      setUnlinkError(error instanceof Error ? error.message : '移出项目失败');
    } finally {
      setIsUnlinking(false);
    }
  };

  const inputClass = 'mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] text-ink outline-none transition-colors focus-visible:border-lilac focus-visible:ring-2 focus-visible:ring-lilac/35';

  return (
    <>
      <WorkbenchCard className="p-5" aria-labelledby="project-sources-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-lilac" />
            <h2 id="project-sources-title" className="ui-section-title">来源与证据</h2>
          </div>
          <p className="ui-body mt-2 text-ink-soft/75">先粘贴可回查的原文快照，再从中定位摘录；个人观察、经验与判断请写在 Brief，避免混成来源陈述。</p>
        </div>
        <span className="rounded-full bg-lilac/25 px-2.5 py-1 font-body text-[11px] text-ink">02 素材</span>
      </div>

      {claims.length > 0 && (
        <section className="mt-5 rounded-2xl border border-lilac/35 bg-lilac/10 p-4" aria-labelledby="project-claim-evidence-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="project-claim-evidence-title" className="ui-section-title text-ink">AI 提取的播客观点</h3>
            <span className="rounded-full bg-white/60 px-2.5 py-1 font-body text-[11px] text-ink-soft">{claims.length} 条已引用观点</span>
          </div>
          <p className="ui-body mt-1 text-ink-soft/70">这是 AI 从逐字稿中提取的研究结果，不等同于来源事实，请结合原文核对。</p>
          <ol className="mt-3 space-y-3">
            {claims.map((claimLink) => {
              const claim = claimLink.claim;
              return (
                <li key={claimLink.id} className="rounded-xl border border-card-border bg-white/65 p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <span className="rounded-full bg-lilac/20 px-2 py-0.5 font-body text-[11px] text-ink-soft">AI 提取说明（待核对）</span>
                      <p className="ui-control-label mt-2 text-ink">{claim.claim}</p>
                    </div>
                    {claim.status === 'stale' && <span className="rounded-full bg-lemon/25 px-2 py-0.5 font-body text-[11px] text-ink-soft">需重新核对</span>}
                  </div>
                  {claim.question && <p className="ui-body mt-1 text-ink-soft/70">回应问题：{claim.question}</p>}
                  {claim.evidence_excerpt && (
                    <div className="mt-3">
                      <p className="ui-metadata text-ink-soft/65">逐字稿原文摘录</p>
                      <blockquote className="mt-1 border-l-2 border-lilac pl-3 ui-reading-body text-ink-soft/85">
                        {claim.evidence_excerpt}
                      </blockquote>
                    </div>
                  )}
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 ui-metadata text-ink-soft/65">
                    {claim.podcast_name && <span>{claim.podcast_name}</span>}
                    {claim.episode_title && <span>{claim.episode_title}</span>}
                    {claim.speaker_name && <span>说话人：{claim.speaker_name}</span>}
                  </div>
                  {claimLink.usage_note && <p className="ui-metadata mt-2 text-ink-soft/75">用途：{claimLink.usage_note}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {sources.length === 0 ? (
        <EmptyState
          className="mt-5"
          title="还没有粘贴原文"
          description="可粘贴采访记录、文章正文或报告摘录。这里不抓取网页，也不把用户提供的材料标成已核验事实。"
        />
      ) : (
        <ol className="mt-5 divide-y divide-card-border rounded-2xl border border-card-border bg-white/45">
          {sources.map((source) => (
            <li key={source.project_source_id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <span className="rounded-full bg-sage/25 px-2 py-0.5 font-body text-[11px] text-ink-soft">用户粘贴材料（未核验）</span>
                  <h3 className="ui-section-title mt-2 text-ink">{source.title}</h3>
                </div>
                <span className="rounded-full bg-lilac/20 px-2.5 py-1 font-body text-[11px] text-ink-soft">{source.source_type === 'manual' ? '粘贴原文' : source.source_type}</span>
              </div>
              {source.content ? (
                <p className="ui-body mt-2 whitespace-pre-wrap text-ink-soft/80">
                  {source.content.length > SOURCE_PREVIEW_LENGTH ? `${source.content.slice(0, SOURCE_PREVIEW_LENGTH)}…` : source.content}
                </p>
              ) : (
                <p className="mt-2 rounded-xl bg-lemon/15 p-3 ui-body text-ink-soft">仅保存用户提供的出处，未抓取、未核验原文；请重新添加包含原文快照的材料后再提取证据。</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {source.content && (
                  <ActionButton size="sm" tone="ghost" aria-label={`查看${source.title}完整原文`} onClick={() => setPreviewSource(source)}>
                    查看完整原文
                  </ActionButton>
                )}
                {onUnlink && (
                  <ActionButton size="sm" tone="ghost" aria-label={`将${source.title}移出项目`} onClick={() => { setUnlinkError(null); setSourceToUnlink(source); }}>
                    移出项目
                  </ActionButton>
                )}
              </div>
              {(source.url || source.usage_note) && (
                <div className="mt-3 space-y-1 border-t border-card-border pt-3 ui-metadata text-ink-soft/70">
                  {source.url && isSafeWebUrl(source.url) && (
                    <p className="break-all">
                      用户提供链接（未抓取／未核验）：<a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-lilac underline-offset-2 hover:text-ink">{source.url}</a>
                    </p>
                  )}
                  {source.usage_note && <p>用途：{source.usage_note}</p>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4">
        <div className="flex flex-wrap gap-2">
          <ActionButton tone="edit" size="sm" aria-expanded={isFormOpen} onClick={() => setIsFormOpen((value) => !value)}>
            {isFormOpen ? '收起原文表单' : '粘贴一份原文'}
          </ActionButton>
          {onContinueResearch && (
            <ActionButton tone="secondary" size="sm" onClick={onContinueResearch}>
              继续播客观点研究
            </ActionButton>
          )}
        </div>
      </div>

      {isFormOpen && (
        <div className="mt-4 rounded-2xl border border-card-border bg-white/55 p-4">
          <p className="ui-body mb-4 rounded-xl border border-lilac/30 bg-lilac/10 p-3 text-ink-soft/80">
            这里只保存你粘贴的材料快照。个人观察、经验与判断请写在 Brief；可选链接只是用户提供的出处，不会自动抓取或核验。
          </p>
          <fieldset disabled={isSaving} className="grid gap-4 disabled:cursor-wait disabled:opacity-65 sm:grid-cols-2">
            <label htmlFor="source-title" className="ui-control-label text-ink-soft">
              原文标题
              <input id="source-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="这份粘贴材料是什么？" className={inputClass} />
            </label>
            <label htmlFor="source-url" className="ui-control-label text-ink-soft">
              用户提供的出处链接（可选，未抓取／未核验）
              <input id="source-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" className={inputClass} />
            </label>
            <label htmlFor="source-content" className="ui-control-label text-ink-soft sm:col-span-2">
              粘贴的原文内容
              <textarea id="source-content" rows={5} value={content} onChange={(event) => setContent(event.target.value)} placeholder="粘贴采访记录、文章正文或报告摘录；个人观察请写入 Brief。" className={`${inputClass} resize-y leading-relaxed`} />
            </label>
            <label htmlFor="source-usage" className="ui-control-label text-ink-soft sm:col-span-2">
              使用备注（可选）
              <input id="source-usage" value={usageNote} onChange={(event) => setUsageNote(event.target.value)} placeholder="例如：作为反例、开头故事或关键数据" className={inputClass} />
            </label>
          </fieldset>
          {(localError || saveError) && <p role="alert" className="mt-4 animate-shake rounded-xl bg-pink/10 p-3 ui-body text-ink">{localError || saveError}</p>}
          <div className="mt-4 flex justify-end">
            <ActionButton tone="confirm" isLoading={isSaving} loadingLabel="正在保存原文快照…" onClick={() => void handleAdd()}>
              保存原文快照
            </ActionButton>
          </div>
        </div>
      )}

      {successMessage && <p role="status" className="mt-4 rounded-xl bg-sage/20 p-3 ui-body text-ink">{successMessage}</p>}
      </WorkbenchCard>

      <ModalShell
        isOpen={Boolean(previewSource)}
        title={previewSource?.title || '来源原文'}
        subtitle="用户粘贴的原文快照（未核验）；AI 提取结果不会覆盖这里。"
        size="lg"
        accent="sage"
        onClose={() => setPreviewSource(null)}
      >
        <p className="whitespace-pre-wrap ui-reading-body text-ink">{previewSource?.content}</p>
      </ModalShell>

      <ModalShell
        isOpen={Boolean(sourceToUnlink)}
        title="移出项目来源"
        subtitle={sourceToUnlink?.title}
        size="sm"
        accent="pink"
        closeOnBackdrop={!isUnlinking}
        closeOnEscape={!isUnlinking}
        onClose={() => { if (!isUnlinking) setSourceToUnlink(null); }}
        footer={(
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton size="sm" disabled={isUnlinking} onClick={() => setSourceToUnlink(null)}>取消</ActionButton>
            <ActionButton size="sm" tone="danger" isLoading={isUnlinking} loadingLabel="正在移出…" onClick={() => void handleUnlink()}>
              移出项目，不删除原始素材
            </ActionButton>
          </div>
        )}
      >
        <p className="ui-body text-ink-soft">只会解除它与当前内容项目的关联，不会删除原始素材，也不会改写已经保存的版本。</p>
        {unlinkError && <p role="alert" className="mt-3 rounded-xl bg-pink/10 p-3 ui-body text-ink">{unlinkError}</p>}
      </ModalShell>
    </>
  );
};

export default ProjectSourcesPanel;
