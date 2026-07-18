import React, { useState } from 'react';
import type { TranscriptionRecord } from '../../store';

interface PodcastMetadataEditorProps {
  record: TranscriptionRecord;
  onSave: (metadata: { podcastName: string; episodeTitle: string; guestNames: string[]; sourceUrl: string; publishedAt: string; topicTags: string[] }) => Promise<void>;
}

const inputClass = 'mt-1.5 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] text-ink outline-none transition-colors focus:border-ink/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac';

export const PodcastMetadataEditor: React.FC<PodcastMetadataEditorProps> = ({ record, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    podcastName: record.podcast_name,
    episodeTitle: record.episode_title,
    guestNames: record.guest_names.join('、'),
    sourceUrl: record.source_url,
    publishedAt: record.published_at,
    topicTags: record.topic_tags.join('、'),
  });

  const splitList = (value: string) => [...new Set(value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean))];

  const save = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        podcastName: draft.podcastName,
        episodeTitle: draft.episodeTitle,
        guestNames: splitList(draft.guestNames),
        sourceUrl: draft.sourceUrl,
        publishedAt: draft.publishedAt,
        topicTags: splitList(draft.topicTags),
      });
      setIsEditing(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存元数据失败');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section id="metadata" className="scroll-mt-20 border-y border-card-border px-1 py-6 sm:px-2" aria-labelledby="podcast-metadata-title">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full bg-blush" aria-hidden="true" />
            <h2 id="podcast-metadata-title" className="font-display text-[15px] font-medium text-ink">资料与出处</h2>
          </div>
          <p className="mt-1 font-body text-[11px] leading-relaxed text-ink-soft/65">为搜索、引用与后续研究保留必要上下文</p>
        </div>
        <button
          type="button"
          onClick={() => setIsEditing((value) => !value)}
          className="ui-pressable min-h-9 shrink-0 rounded-lg px-3 font-body text-[11px] text-ink-soft hover:bg-white/60 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac"
        >
          {isEditing ? '取消编辑' : '编辑资料'}
        </button>
      </div>

      {isEditing ? (
        <div className="mt-5 grid max-w-3xl gap-4 sm:grid-cols-2">
          <label className="font-body text-[11px] font-medium text-ink-soft">
            播客节目名
            <input className={inputClass} value={draft.podcastName} onChange={(event) => setDraft((value) => ({ ...value, podcastName: event.target.value }))} />
          </label>
          <label className="font-body text-[11px] font-medium text-ink-soft">
            单集标题
            <input className={inputClass} required value={draft.episodeTitle} onChange={(event) => setDraft((value) => ({ ...value, episodeTitle: event.target.value }))} />
          </label>
          <label className="font-body text-[11px] font-medium text-ink-soft">
            嘉宾（逗号分隔）
            <input className={inputClass} value={draft.guestNames} onChange={(event) => setDraft((value) => ({ ...value, guestNames: event.target.value }))} />
          </label>
          <label className="font-body text-[11px] font-medium text-ink-soft">
            发布日期
            <input type="date" className={inputClass} value={draft.publishedAt} onChange={(event) => setDraft((value) => ({ ...value, publishedAt: event.target.value }))} />
          </label>
          <label className="font-body text-[11px] font-medium text-ink-soft sm:col-span-2">
            原始链接
            <input type="url" className={inputClass} value={draft.sourceUrl} onChange={(event) => setDraft((value) => ({ ...value, sourceUrl: event.target.value }))} />
          </label>
          <label className="font-body text-[11px] font-medium text-ink-soft sm:col-span-2">
            主题标签（逗号分隔）
            <input className={inputClass} value={draft.topicTags} onChange={(event) => setDraft((value) => ({ ...value, topicTags: event.target.value }))} />
          </label>
          {error && (
            <p className="animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[11px] leading-relaxed text-ink sm:col-span-2" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            disabled={isSaving || !draft.episodeTitle.trim()}
            onClick={() => void save()}
            className="ui-pressable min-h-10 rounded-xl bg-sage px-5 py-2.5 font-body text-[11px] font-medium text-ink shadow-btn hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lilac disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2 sm:justify-self-start"
          >
            {isSaving ? '保存中…' : '保存资料'}
          </button>
        </div>
      ) : (
        <dl className="mt-5 grid max-w-4xl gap-x-8 gap-y-4 font-body sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium text-ink-soft/55">节目</dt>
            <dd className="mt-1 break-words text-[12px] leading-[1.7] text-ink-soft/80">{record.podcast_name || '待补充'}</dd>
          </div>
          <div className="min-w-0 sm:col-span-2 lg:col-span-2">
            <dt className="text-[11px] font-medium text-ink-soft/55">单集</dt>
            <dd className="mt-1 break-words text-[13px] font-medium leading-[1.65] text-ink">{record.episode_title || '待补充'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium text-ink-soft/55">嘉宾</dt>
            <dd className="mt-1 break-words text-[12px] leading-[1.7] text-ink-soft/80">{record.guest_names.join('、') || '待补充'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium text-ink-soft/55">发布日期</dt>
            <dd className="mt-1 text-[12px] leading-[1.7] text-ink-soft/80">{record.published_at || '待补充'}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium text-ink-soft/55">主题</dt>
            <dd className="mt-1 break-words text-[12px] leading-[1.7] text-ink-soft/80">{record.topic_tags.join(' · ') || '待补充'}</dd>
          </div>
          {record.source_url && (
            <div className="min-w-0 sm:col-span-2 lg:col-span-3">
              <dt className="text-[11px] font-medium text-ink-soft/55">原始链接</dt>
              <dd className="mt-1 break-all text-[11px] leading-[1.7] text-ink-soft/65">{record.source_url}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
};

export default PodcastMetadataEditor;
