import React, { useEffect, useState } from 'react';
import { getApiErrorMessage } from '../../services/apiError';
import useStore, { type ContentTemplate, type ContentTemplateInput } from '../../store';
import { ConfirmDialog } from '../ConfirmDialog';
import { ModalShell } from '../ModalShell';

const EMPTY_TEMPLATE: ContentTemplateInput = {
  name: '',
  platform: '通用',
  content_type: '口播',
  target_duration_seconds: 180,
  audience: '泛知识内容受众',
  tone: '自然、清晰、有信息密度',
  structure: '开头点题；正文分层展开；结尾总结并给出行动引导',
  prompt_instructions: '',
  default_voice_config: '{}',
};

function toInput(template: ContentTemplate, name = template.name): ContentTemplateInput {
  return {
    name,
    platform: template.platform,
    content_type: template.content_type,
    target_duration_seconds: template.target_duration_seconds,
    audience: template.audience,
    tone: template.tone,
    structure: template.structure,
    prompt_instructions: template.prompt_instructions,
    default_voice_config: template.default_voice_config,
  };
}

export const ContentTemplatePicker: React.FC = () => {
  const templates = useStore((state) => state.contentTemplates);
  const selectedTemplateId = useStore((state) => state.selectedTemplateId);
  const isLoading = useStore((state) => state.isLoadingContentTemplates);
  const storeError = useStore((state) => state.contentTemplateError);
  const fetchTemplates = useStore((state) => state.fetchContentTemplates);
  const selectTemplate = useStore((state) => state.selectContentTemplate);
  const createTemplate = useStore((state) => state.createContentTemplate);
  const updateTemplate = useStore((state) => state.updateContentTemplate);
  const deleteTemplate = useStore((state) => state.deleteContentTemplate);

  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ContentTemplateInput>(EMPTY_TEMPLATE);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ContentTemplate | null>(null);

  useEffect(() => {
    if (templates.length === 0 && !isLoading) fetchTemplates().catch(() => undefined);
  }, [fetchTemplates, isLoading, templates.length]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_TEMPLATE);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEdit = (template: ContentTemplate) => {
    setEditingId(template.id);
    setForm(toInput(template));
    setFormError(null);
    setIsFormOpen(true);
  };

  const openDuplicate = (template: ContentTemplate) => {
    setEditingId(null);
    setForm(toInput(template, `${template.name} 副本`));
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    setFormError(null);
    try {
      if (editingId == null) await createTemplate(form);
      else await updateTemplate(editingId, form);
      setIsFormOpen(false);
    } catch (error) {
      setFormError(getApiErrorMessage(error, '保存模板失败'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteTemplate(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      setFormError(getApiErrorMessage(error, '删除模板失败'));
    }
  };

  const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);

  return (
    <>
      <section className="bg-white/80 backdrop-blur-sm rounded-card p-5 shadow-card border border-card-border animate-fade-in-up">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-lilac" />
          <h3 className="font-display text-[14px] font-medium italic text-ink-soft">创作模板</h3>
        </div>
        <button type="button" onClick={() => setIsManagerOpen(true)} className="font-body text-[12px] text-ink-soft hover:text-ink">
          管理模板
        </button>
      </div>

      {isLoading && templates.length === 0 ? (
        <div className="grid gap-2 sm:grid-cols-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-ink/5" />)}
        </div>
      ) : (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {templates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => selectTemplate(template.id)}
              className={`min-w-[190px] rounded-2xl border p-3 text-left transition-all duration-150 ${selectedTemplateId === template.id ? 'border-lilac bg-lilac/25 shadow-btn' : 'border-card-border bg-white/55 hover:bg-white/80'}`}
            >
              <span className="block font-body text-[10px] uppercase tracking-wider text-ink-soft/60">{template.platform} · {template.target_duration_seconds} 秒</span>
              <span className="mt-1 block font-body text-[13px] font-medium text-ink">{template.name}</span>
              <span className="mt-1 line-clamp-2 block font-body text-[11px] text-ink-soft/65">{template.tone}</span>
            </button>
          ))}
        </div>
      )}
      {selectedTemplate && <p className="mt-3 font-body text-[11px] text-ink-soft/65">当前：{selectedTemplate.structure}</p>}
      {storeError && <div className="mt-3 animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 text-[12px] text-ink">{storeError}</div>}
      </section>

      <ModalShell
        isOpen={isManagerOpen}
        title="创作模板管理"
        subtitle="内置模板可复制，自定义模板可以编辑和删除。"
        onClose={() => { setIsManagerOpen(false); setIsFormOpen(false); }}
        size="xl"
        accent="lilac"
        headerActions={<button type="button" onClick={openCreate} className="rounded-xl bg-lemon px-4 py-2 font-body text-[12px] font-medium text-ink shadow-btn">新建模板</button>}
      >
        {isFormOpen ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="font-body text-[11px] text-ink-soft">模板名称<input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 text-[12px] text-ink outline-none" /></label>
              <label className="font-body text-[11px] text-ink-soft">目标平台<input required value={form.platform} onChange={(event) => setForm({ ...form, platform: event.target.value })} className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 text-[12px] text-ink outline-none" /></label>
              <label className="font-body text-[11px] text-ink-soft">目标时长（秒）<input required type="number" min="15" max="7200" value={form.target_duration_seconds} onChange={(event) => setForm({ ...form, target_duration_seconds: Number(event.target.value) })} className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 text-[12px] text-ink outline-none" /></label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="font-body text-[11px] text-ink-soft">内容类型<input required value={form.content_type} onChange={(event) => setForm({ ...form, content_type: event.target.value })} className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 text-[12px] text-ink outline-none" /></label>
              <label className="font-body text-[11px] text-ink-soft">目标受众<input required value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })} className="mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 text-[12px] text-ink outline-none" /></label>
            </div>
            <label className="block font-body text-[11px] text-ink-soft">语言风格<textarea required value={form.tone} onChange={(event) => setForm({ ...form, tone: event.target.value })} className="mt-1 h-20 w-full resize-none rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 text-[12px] text-ink outline-none" /></label>
            <label className="block font-body text-[11px] text-ink-soft">稿件结构<textarea required value={form.structure} onChange={(event) => setForm({ ...form, structure: event.target.value })} className="mt-1 h-20 w-full resize-none rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 text-[12px] text-ink outline-none" /></label>
            <label className="block font-body text-[11px] text-ink-soft">补充要求<textarea value={form.prompt_instructions} onChange={(event) => setForm({ ...form, prompt_instructions: event.target.value })} className="mt-1 h-20 w-full resize-none rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 text-[12px] text-ink outline-none" /></label>
            {formError && <div className="animate-shake rounded-xl border border-pink/30 bg-pink/10 p-3 font-body text-[12px] text-ink">{formError}</div>}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 font-body text-[12px] text-ink-soft">取消</button><button disabled={isSaving} className="rounded-xl bg-sage px-4 py-2 font-body text-[12px] font-medium text-ink shadow-btn disabled:opacity-40">{isSaving ? '保存中…' : '保存模板'}</button></div>
          </form>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => <div key={template.id} className="flex items-center gap-3 rounded-2xl border border-card-border bg-white/60 p-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-body text-[13px] font-medium text-ink">{template.name}</span>{template.is_builtin === 1 && <span className="rounded-full bg-lilac/30 px-2 py-0.5 text-[9px] text-ink">内置</span>}</div><p className="mt-1 truncate font-body text-[11px] text-ink-soft/65">{template.platform} · {template.target_duration_seconds} 秒 · {template.audience}</p></div><button type="button" onClick={() => openDuplicate(template)} className="font-body text-[11px] text-ink-soft hover:text-ink">复制</button>{template.is_builtin === 0 && <><button type="button" onClick={() => openEdit(template)} className="font-body text-[11px] text-ink-soft hover:text-ink">编辑</button><button type="button" onClick={() => setDeleteTarget(template)} className="font-body text-[11px] text-pink hover:text-ink">删除</button></>}</div>)}
          </div>
        )}
      </ModalShell>

      <ConfirmDialog isOpen={Boolean(deleteTarget)} title="删除创作模板" message={`确定删除“${deleteTarget?.name || ''}”吗？`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </>
  );
};

export default ContentTemplatePicker;
