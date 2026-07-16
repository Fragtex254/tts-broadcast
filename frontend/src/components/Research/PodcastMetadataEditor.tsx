import React, { useState } from 'react';
import type { TranscriptionRecord } from '../../store';

interface PodcastMetadataEditorProps {
  record: TranscriptionRecord;
  onSave: (metadata: { podcastName: string; episodeTitle: string; guestNames: string[]; sourceUrl: string; publishedAt: string; topicTags: string[] }) => Promise<void>;
}

const inputClass = 'w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] text-ink outline-none transition-colors focus:border-ink/20';

export const PodcastMetadataEditor: React.FC<PodcastMetadataEditorProps> = ({ record, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ podcastName: record.podcast_name, episodeTitle: record.episode_title, guestNames: record.guest_names.join('、'), sourceUrl: record.source_url, publishedAt: record.published_at, topicTags: record.topic_tags.join('、') });

  const splitList = (value: string) => [...new Set(value.split(/[、,，\n]/).map((item) => item.trim()).filter(Boolean))];
  const save = async () => {
    setIsSaving(true); setError(null);
    try {
      await onSave({ podcastName: draft.podcastName, episodeTitle: draft.episodeTitle, guestNames: splitList(draft.guestNames), sourceUrl: draft.sourceUrl, publishedAt: draft.publishedAt, topicTags: splitList(draft.topicTags) });
      setIsEditing(false);
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : '保存元数据失败'); }
    finally { setIsSaving(false); }
  };

  return (
    <section className="rounded-card border border-card-border bg-white/80 p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-blush" /><h2 className="font-display italic text-[14px] font-medium text-ink-soft">播客资料</h2></div>
        <button type="button" onClick={() => setIsEditing((value) => !value)} className="font-body text-[11px] text-ink-soft hover:text-ink">{isEditing ? '取消' : '编辑资料'}</button>
      </div>
      {isEditing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="font-body text-[10px] text-ink-soft">播客节目名<input className={`${inputClass} mt-1`} value={draft.podcastName} onChange={(event) => setDraft((value) => ({ ...value, podcastName: event.target.value }))} /></label>
          <label className="font-body text-[10px] text-ink-soft">单集标题<input className={`${inputClass} mt-1`} required value={draft.episodeTitle} onChange={(event) => setDraft((value) => ({ ...value, episodeTitle: event.target.value }))} /></label>
          <label className="font-body text-[10px] text-ink-soft">嘉宾（逗号分隔）<input className={`${inputClass} mt-1`} value={draft.guestNames} onChange={(event) => setDraft((value) => ({ ...value, guestNames: event.target.value }))} /></label>
          <label className="font-body text-[10px] text-ink-soft">发布日期<input type="date" className={`${inputClass} mt-1`} value={draft.publishedAt} onChange={(event) => setDraft((value) => ({ ...value, publishedAt: event.target.value }))} /></label>
          <label className="font-body text-[10px] text-ink-soft sm:col-span-2">原始链接<input type="url" className={`${inputClass} mt-1`} value={draft.sourceUrl} onChange={(event) => setDraft((value) => ({ ...value, sourceUrl: event.target.value }))} /></label>
          <label className="font-body text-[10px] text-ink-soft sm:col-span-2">主题标签（逗号分隔）<input className={`${inputClass} mt-1`} value={draft.topicTags} onChange={(event) => setDraft((value) => ({ ...value, topicTags: event.target.value }))} /></label>
          {error && <p className="animate-shake rounded-xl bg-pink/10 p-3 font-body text-[11px] text-ink sm:col-span-2">{error}</p>}
          <button type="button" disabled={isSaving || !draft.episodeTitle.trim()} onClick={() => void save()} className="rounded-full bg-sage px-5 py-2 font-body text-[11px] font-medium text-ink shadow-btn disabled:opacity-40 sm:col-span-2">{isSaving ? '保存中…' : '保存资料'}</button>
        </div>
      ) : (
        <div className="grid gap-3 font-body text-[12px] text-ink-soft sm:grid-cols-2">
          <p><span className="text-ink-soft/55">节目</span><br /><strong className="text-ink">{record.podcast_name || '待补充'}</strong></p>
          <p><span className="text-ink-soft/55">单集</span><br /><strong className="text-ink">{record.episode_title}</strong></p>
          <p><span className="text-ink-soft/55">嘉宾</span><br />{record.guest_names.join('、') || '待补充'}</p>
          <p><span className="text-ink-soft/55">发布日期</span><br />{record.published_at || '待补充'}</p>
          <p className="sm:col-span-2"><span className="text-ink-soft/55">主题</span><br />{record.topic_tags.join(' · ') || '待补充'}</p>
        </div>
      )}
    </section>
  );
};

export default PodcastMetadataEditor;
