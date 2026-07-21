import React, { useState } from 'react';
import type { ContentArtifactRevision, ContentRevisionCitation, ContentSourceFragment } from '../../store';
import { ModalShell } from '../ModalShell';
import { ActionButton } from '../ui/ActionButton';
import { EmptyState } from '../ui/EmptyState';
import { WorkbenchCard } from '../ui/WorkbenchCard';

interface ProjectCitationPanelProps {
  revision: ContentArtifactRevision | null;
  onFetchFragments: (sourceId: number) => Promise<ContentSourceFragment[]>;
  isHistoricalRevision?: boolean;
}

const BASIS_LABEL = {
  evidence: '原文逐字摘录（未核验）',
  creator: '创作者输入',
  inference: 'AI 推断，待核对',
} as const;

function currentReuseMessage(citation: ContentRevisionCitation): string {
  if (citation.reuse_eligible) return '当前仍可用于新的生成任务';
  if (!citation.source_linked) return '来源已移出项目；历史引用仍保留，当前不可复用';
  if (citation.evidence_lifecycle_status !== 'active') return '证据当前已失效或被修正；历史引用仍保留，当前不可复用';
  if (citation.evidence_decision_state !== 'selected') return '这条证据当前未被采用；历史引用仍保留，当前不可复用';
  return '当前不可复用';
}

export const ProjectCitationPanel: React.FC<ProjectCitationPanelProps> = ({
  revision,
  onFetchFragments,
  isHistoricalRevision = false,
}) => {
  const [inspection, setInspection] = useState<{ citation: ContentRevisionCitation; fragments: ContentSourceFragment[] } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const inspect = async (citation: ContentRevisionCitation) => {
    setIsLoading(true);
    setLoadError(null);
    setInspection({ citation, fragments: [] });
    try {
      const fragments = await onFetchFragments(citation.source_id);
      setInspection({ citation, fragments });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '读取引用原文失败');
    } finally {
      setIsLoading(false);
    }
  };

  const blocks = revision?.provenance?.blocks || [];
  const citations = revision?.citations || [];
  const headingId = `project-citation-title-${revision?.id || 'empty'}-${isHistoricalRevision ? 'history' : 'current'}`;

  return (
    <>
      <WorkbenchCard className="p-5" aria-labelledby={headingId}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sage" />
              <h2 id={headingId} className="ui-section-title">{isHistoricalRevision ? '历史主稿的依据' : '当前主稿的依据'}</h2>
            </div>
            <p className="ui-body mt-2 text-ink-soft/75">引用快照回答“当时为什么这样写”；当前复用资格单独说明，不会改写历史版本。</p>
          </div>
          {revision && (
            <span className="rounded-full bg-sage/25 px-2.5 py-1 font-body text-[11px] text-ink">
              {isHistoricalRevision ? '历史快照 · ' : ''}主稿第 {revision.revision_number} 版
            </span>
          )}
        </div>

        {!revision ? (
          <EmptyState className="mt-4" title="还没有可核验的主稿版本" description="手工写作不受影响；保存主稿后，这里会展示版本来源和引用关系。" />
        ) : blocks.length === 0 && citations.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-card-border bg-white/50 p-4">
            <p className="ui-control-label text-ink">本版本没有结构化引用信息</p>
            <p className="ui-body mt-1 text-ink-soft/75">这通常是手工版本或旧版本，不代表内容错误；可继续手工编辑并保存新 Revision。</p>
          </div>
        ) : (
          <>
            {revision.provenance.origin === 'ai' && (
              <section className="mt-4 rounded-2xl border border-lilac/35 bg-lilac/10 p-4" aria-label="AI 草案生成记录">
                <h3 className="ui-section-title text-ink">AI 草案生成记录</h3>
                <dl className="mt-2 grid gap-x-4 gap-y-2 ui-metadata text-ink-soft sm:grid-cols-2">
                  <div><dt className="font-medium">任务</dt><dd>{revision.provenance.operation}</dd></div>
                  <div><dt className="font-medium">模型</dt><dd>{revision.provenance.provider || '未记录'} / {revision.provenance.model || '未记录'}</dd></div>
                  <div><dt className="font-medium">Prompt 版本</dt><dd>{revision.provenance.prompt_version || '未记录'}</dd></div>
                  <div><dt className="font-medium">提纲 Revision</dt><dd>{revision.provenance.outline_revision_id || '未使用'}</dd></div>
                  <div className="sm:col-span-2"><dt className="font-medium">采用的证据 ID</dt><dd>{revision.provenance.evidence_ids.length ? revision.provenance.evidence_ids.join('、') : '无'}</dd></div>
                  <div className="sm:col-span-2"><dt className="font-medium">上下文指纹</dt><dd className="break-all font-mono">{revision.provenance.input_fingerprint || '未记录'}</dd></div>
                </dl>
              </section>
            )}
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <section aria-labelledby="provenance-block-title">
              <h3 id="provenance-block-title" className="ui-section-title text-ink">内容构成</h3>
              <ol className="mt-3 space-y-2">
                {blocks.map((block, index) => (
                  <li key={`${block.basis}-${index}`} className="rounded-xl border border-card-border bg-white/55 p-3">
                    <span className={`rounded-full px-2 py-0.5 font-body text-[11px] text-ink-soft ${block.basis === 'creator' ? 'bg-blush/35' : block.basis === 'inference' ? 'bg-lemon/35' : 'bg-sage/25'}`}>
                      {BASIS_LABEL[block.basis]}
                    </span>
                    <p className="ui-body mt-2 text-ink">{block.text}</p>
                    {block.basis === 'inference' && block.evidence_ids.length > 0 && (
                      <p className="ui-metadata mt-2 text-ink-soft/70">参考了证据上下文 #{block.evidence_ids.join('、#')}，但不是直接引文。</p>
                    )}
                    {block.basis === 'evidence' && block.evidence_ids.length > 0 && (
                      <p className="ui-metadata mt-2 text-ink-soft/70">直接引用证据 #{block.evidence_ids.join('、#')}</p>
                    )}
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="revision-citations-title">
              <h3 id="revision-citations-title" className="ui-section-title text-ink">直接引用</h3>
              {citations.length === 0 ? (
                <p className="ui-body mt-3 text-ink-soft/70">本版本没有直接引用标记。</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {citations.map((citation) => (
                    <li key={citation.id} className="rounded-xl border border-card-border bg-white/55 p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="ui-control-label text-ink">{citation.marker} · {citation.source_title}</p>
                        <span className={`rounded-full px-2 py-0.5 font-body text-[11px] text-ink-soft ${citation.is_stale ? 'bg-pink/20' : 'bg-sage/25'}`}>
                          {citation.is_stale ? '引用快照需核对' : '历史引用快照完整'}
                        </span>
                      </div>
                      <blockquote className="mt-2 border-l-2 border-sage pl-3 ui-reading-body text-ink">{citation.excerpt}</blockquote>
                      <p className="ui-body mt-2 text-ink-soft/75">{currentReuseMessage(citation)}</p>
                      <ActionButton
                        className="mt-2"
                        size="sm"
                        tone="secondary"
                        aria-label={`核验${citation.source_title}的引用原文`}
                        onClick={() => void inspect(citation)}
                      >
                        查看原文上下文
                      </ActionButton>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            </div>
          </>
        )}
      </WorkbenchCard>

      <ModalShell
        isOpen={Boolean(inspection)}
        title="核验引用原文"
        subtitle={inspection ? `${inspection.citation.source_title} · 片段 ${inspection.citation.start_fragment_index + 1}–${inspection.citation.end_fragment_index + 1}` : undefined}
        size="lg"
        accent="sage"
        onClose={() => { setInspection(null); setLoadError(null); }}
      >
        {isLoading ? (
          <div role="status" className="space-y-2 animate-pulse" aria-label="正在读取引用原文">
            {[1, 2, 3].map((item) => <div key={item} className="h-16 rounded-xl bg-ink/5" />)}
          </div>
        ) : loadError ? (
          <div role="alert" className="rounded-xl bg-pink/10 p-3 ui-body text-ink">{loadError}</div>
        ) : (
          <ol className="space-y-2">
            {inspection?.fragments.map((fragment) => {
              const isQuoted = fragment.index >= inspection.citation.start_fragment_index && fragment.index <= inspection.citation.end_fragment_index;
              return (
                <li key={fragment.index} className={`rounded-xl border p-3 ${isQuoted ? 'border-sage/70 bg-sage/15' : 'border-card-border bg-white/45'}`}>
                  <p className="ui-metadata text-ink-soft/65">片段 {fragment.index + 1}{isQuoted ? ' · 引用范围' : ''}</p>
                  <p className="ui-reading-body mt-1 whitespace-pre-wrap text-ink">{fragment.content}</p>
                </li>
              );
            })}
          </ol>
        )}
      </ModalShell>
    </>
  );
};

export default ProjectCitationPanel;
