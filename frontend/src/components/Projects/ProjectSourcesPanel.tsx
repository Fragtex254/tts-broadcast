import React, { useState } from 'react';
import type { ContentProject, ContentProjectSource, ContentProjectSourceInput } from '../../store';
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
}

export const ProjectSourcesPanel: React.FC<ProjectSourcesPanelProps> = ({
  sources,
  claims = [],
  isSaving,
  saveError,
  onAdd,
  onContinueResearch,
}) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [usageNote, setUsageNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(sources.length === 0);
  const [successMessage, setSuccessMessage] = useState('');

  const handleAdd = async () => {
    if (!title.trim() || !content.trim()) {
      setLocalError('请填写来源标题和内容');
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
      setSuccessMessage('来源已加入项目，并保留为独立素材。');
      setIsFormOpen(false);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : '添加来源失败');
    }
  };

  const inputClass = 'mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] text-ink outline-none transition-colors focus-visible:border-lilac focus-visible:ring-2 focus-visible:ring-lilac/35';

  return (
    <WorkbenchCard className="p-5" aria-labelledby="project-sources-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-lilac" />
            <h2 id="project-sources-title" className="ui-section-title">来源与证据</h2>
          </div>
          <p className="ui-body mt-2 text-ink-soft/75">先收进原始材料，后续再把关键事实和个人判断连接起来。</p>
        </div>
        <span className="rounded-full bg-lilac/25 px-2.5 py-1 font-body text-[11px] text-ink">02 素材</span>
      </div>

      {claims.length > 0 && (
        <section className="mt-5 rounded-2xl border border-lilac/35 bg-lilac/10 p-4" aria-labelledby="project-claim-evidence-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="project-claim-evidence-title" className="ui-section-title text-ink">播客观点证据</h3>
            <span className="rounded-full bg-white/60 px-2.5 py-1 font-body text-[11px] text-ink-soft">{claims.length} 条已引用观点</span>
          </div>
          <p className="ui-body mt-1 text-ink-soft/70">这些观点来自项目研究，不会因为进入写作页而消失。</p>
          <ol className="mt-3 space-y-3">
            {claims.map((claimLink) => {
              const claim = claimLink.claim;
              return (
                <li key={claimLink.id} className="rounded-xl border border-card-border bg-white/65 p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="ui-control-label text-ink">{claim.claim}</p>
                    {claim.status === 'stale' && <span className="rounded-full bg-lemon/25 px-2 py-0.5 font-body text-[10px] text-ink-soft">需重新核对</span>}
                  </div>
                  {claim.question && <p className="ui-body mt-1 text-ink-soft/70">回应问题：{claim.question}</p>}
                  {claim.evidence_excerpt && (
                    <blockquote className="mt-2 border-l-2 border-lilac pl-3 ui-reading-body text-ink-soft/85">
                      {claim.evidence_excerpt}
                    </blockquote>
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
          title="还没有手写来源"
          description="可以先记录一段观察、采访摘录或事实材料；AI HOT 与转录来源会在后续继续接入。"
        />
      ) : (
        <ol className="mt-5 divide-y divide-card-border rounded-2xl border border-card-border bg-white/45">
          {sources.map((source) => (
            <li key={source.project_source_id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="ui-section-title text-ink">{source.title}</h3>
                <span className="rounded-full bg-lilac/20 px-2.5 py-1 font-body text-[11px] text-ink-soft">
                  {source.source_type === 'manual' ? '手写来源' : source.source_type}
                </span>
              </div>
              <p className="ui-body mt-2 whitespace-pre-wrap text-ink-soft/80">{source.content}</p>
              {(source.url || source.usage_note) && (
                <div className="mt-3 space-y-1 border-t border-card-border pt-3 ui-metadata text-ink-soft/70">
                  {source.url && (
                    <p className="break-all">
                      出处：<a href={source.url} target="_blank" rel="noreferrer" className="underline decoration-lilac underline-offset-2 hover:text-ink">{source.url}</a>
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
            {isFormOpen ? '收起来源表单' : '添加手写来源'}
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
          <fieldset disabled={isSaving} className="grid gap-4 disabled:cursor-wait disabled:opacity-65 sm:grid-cols-2">
            <label htmlFor="source-title" className="ui-control-label text-ink-soft">
              来源标题
              <input id="source-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="这段材料是什么？" className={inputClass} />
            </label>
            <label htmlFor="source-url" className="ui-control-label text-ink-soft">
              原始链接（可选）
              <input id="source-url" type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" className={inputClass} />
            </label>
            <label htmlFor="source-content" className="ui-control-label text-ink-soft sm:col-span-2">
              来源内容
              <textarea id="source-content" rows={5} value={content} onChange={(event) => setContent(event.target.value)} placeholder="粘贴原文、摘录或写下观察，暂时不要让 AI 替你概括。" className={`${inputClass} resize-y leading-relaxed`} />
            </label>
            <label htmlFor="source-usage" className="ui-control-label text-ink-soft sm:col-span-2">
              使用备注（可选）
              <input id="source-usage" value={usageNote} onChange={(event) => setUsageNote(event.target.value)} placeholder="例如：作为反例、开头故事或关键数据" className={inputClass} />
            </label>
          </fieldset>
          {(localError || saveError) && <p role="alert" className="mt-4 animate-shake rounded-xl bg-pink/10 p-3 ui-body text-ink">{localError || saveError}</p>}
          <div className="mt-4 flex justify-end">
            <ActionButton tone="confirm" isLoading={isSaving} loadingLabel="正在保存来源…" onClick={() => void handleAdd()}>
              保存来源
            </ActionButton>
          </div>
        </div>
      )}

      {successMessage && <p role="status" className="mt-4 rounded-xl bg-sage/20 p-3 ui-body text-ink">{successMessage}</p>}
    </WorkbenchCard>
  );
};

export default ProjectSourcesPanel;
