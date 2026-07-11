import React, { useState } from 'react';
import { getApiErrorMessage } from '../../services/apiError';
import useStore, { type Broadcast, type PublishMetadata } from '../../store';
import { ModalShell } from '../ModalShell';
import { getBroadcastPublishMetadata } from './publishMetadataModel';

interface PublishPackageModalProps {
  isOpen: boolean;
  broadcast: Broadcast;
  onClose: () => void;
}

export const PublishPackageModal: React.FC<PublishPackageModalProps> = ({ isOpen, broadcast, onClose }) => {
  const generateMetadata = useStore((state) => state.generatePublishMetadata);
  const saveMetadata = useStore((state) => state.savePublishMetadata);
  const downloadPackage = useStore((state) => state.downloadPublishPackage);
  const isGenerating = useStore((state) => state.isGeneratingPublishMetadata);
  const isDownloading = useStore((state) => state.isDownloadingPublishPackage);
  const storeError = useStore((state) => state.publishPackageError);

  const [form, setForm] = useState<PublishMetadata>(() => getBroadcastPublishMetadata(broadcast));
  const [tagText, setTagText] = useState(() => getBroadcastPublishMetadata(broadcast).tags.join('、'));
  const [alternativeText, setAlternativeText] = useState(() => getBroadcastPublishMetadata(broadcast).alternativeTitles.join('\n'));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const collectForm = (): PublishMetadata => ({
    ...form,
    alternativeTitles: alternativeText.split('\n').map((item) => item.trim()).filter(Boolean),
    tags: tagText.split(/[、,，\s]+/).map((item) => item.replace(/^#+/, '').trim()).filter(Boolean),
  });

  const handleGenerate = async () => {
    setError(null);
    try {
      const metadata = await generateMetadata(broadcast.id);
      setForm(metadata);
      setTagText(metadata.tags.join('、'));
      setAlternativeText(metadata.alternativeTitles.join('\n'));
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, '生成发布信息失败'));
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const metadata = await saveMetadata(broadcast.id, collectForm());
      setForm(metadata);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, '保存发布信息失败'));
      throw requestError;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    try {
      await handleSave();
      await downloadPackage(broadcast.id);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, '生成发布包失败'));
    }
  };

  return (
    <ModalShell
      isOpen={isOpen}
      title="发布内容包"
      subtitle="编辑发布信息，并打包 MP3、稿件、文案与可用字幕。"
      onClose={onClose}
      size="xl"
      accent="sage"
      footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="px-4 py-2 font-body text-[12px] text-ink-soft">取消</button><button type="button" onClick={handleSave} disabled={isSaving || isGenerating || isDownloading} className="rounded-xl bg-lilac px-4 py-2.5 font-body text-[12px] font-medium text-ink shadow-btn disabled:opacity-40">{isSaving ? '保存中…' : '保存发布信息'}</button><button type="button" onClick={handleDownload} disabled={isSaving || isGenerating || isDownloading || !form.primaryTitle.trim()} className="rounded-xl bg-sage px-5 py-2.5 font-body text-[12px] font-medium text-ink shadow-btn disabled:opacity-40">{isDownloading ? '正在打包…' : '下载 ZIP 内容包'}</button></div>}
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-card-border bg-white/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-body text-[12px] font-medium text-ink">AI 生成发布信息</p><p className="mt-1 font-body text-[11px] text-ink-soft/65">根据当前稿件和创作模板生成标题、简介、文案和标签。</p></div>
          <button type="button" onClick={handleGenerate} disabled={isGenerating || isDownloading} className="rounded-xl bg-lemon px-4 py-2.5 font-body text-[12px] font-medium text-ink shadow-btn disabled:opacity-40">{isGenerating ? '生成中…' : form.summary ? '重新生成' : '生成发布信息'}</button>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block font-body text-[11px] text-ink-soft">主标题<input value={form.primaryTitle} onChange={(event) => setForm({ ...form, primaryTitle: event.target.value })} className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] text-ink outline-none" /></label>
            <label className="block font-body text-[11px] text-ink-soft">备选标题（每行一个）<textarea value={alternativeText} onChange={(event) => setAlternativeText(event.target.value)} className="mt-1 h-32 w-full resize-none rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] leading-relaxed text-ink outline-none" /></label>
            <label className="block font-body text-[11px] text-ink-soft">标签<input value={tagText} onChange={(event) => setTagText(event.target.value)} placeholder="AI、创作、口播" className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] text-ink outline-none" /></label>
          </div>
          <div className="space-y-3">
            <label className="block font-body text-[11px] text-ink-soft">内容简介<textarea value={form.summary} onChange={(event) => setForm({ ...form, summary: event.target.value })} className="mt-1 h-28 w-full resize-none rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] leading-relaxed text-ink outline-none" /></label>
            <label className="block font-body text-[11px] text-ink-soft">平台发布文案<textarea value={form.publishCopy} onChange={(event) => setForm({ ...form, publishCopy: event.target.value })} className="mt-1 h-44 w-full resize-none rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] leading-relaxed text-ink outline-none" /></label>
          </div>
        </div>

        <div className="rounded-2xl border border-card-border bg-paper/70 p-4 font-body text-[11px] leading-relaxed text-ink-soft/70">
          发布包包含 MP3、Markdown/TXT 稿件、发布文案、标题与标签。{broadcast.mode === 'segmented' ? '所有分段音频完成后还会包含 SRT/VTT 字幕。' : '当前为整篇模式，首版暂不生成字幕；切分并生成各段音频后可导出字幕。'}
        </div>
        {(error || storeError) && <div className="animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[12px] text-ink">{error || storeError}</div>}
      </div>
    </ModalShell>
  );
};

export default PublishPackageModal;
