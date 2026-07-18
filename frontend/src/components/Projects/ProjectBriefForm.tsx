import React, { useEffect, useState } from 'react';
import type { ContentProject, ContentProjectUpdateInput, ContentTargetPlatform } from '../../store';
import { ActionButton } from '../ui/ActionButton';
import { WorkbenchCard } from '../ui/WorkbenchCard';

interface ProjectBriefFormProps {
  project: ContentProject;
  onSave: (data: ContentProjectUpdateInput) => Promise<ContentProject>;
  onDirtyChange?: (dirty: boolean) => void;
}

interface BriefDraft {
  title: string;
  topic: string;
  audience: string;
  goal: string;
  angle: string;
  tone: string;
  contentFormat: string;
  targetPlatform: ContentTargetPlatform;
  thesis: string;
  personalPractice: string;
  personalJudgment: string;
  discussionQuestion: string;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const projectToBrief = (project: ContentProject): BriefDraft => ({
  title: project.title,
  topic: project.topic,
  audience: project.audience,
  goal: project.goal,
  angle: project.angle,
  tone: project.tone,
  contentFormat: project.content_format,
  targetPlatform: project.target_platform,
  thesis: project.thesis,
  personalPractice: project.personal_practice,
  personalJudgment: project.personal_judgment,
  discussionQuestion: project.discussion_question,
});

const PLATFORM_OPTIONS: Array<{ value: ContentTargetPlatform; label: string }> = [
  { value: 'general', label: '通用内容' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'wechat', label: '公众号' },
];

export const ProjectBriefForm: React.FC<ProjectBriefFormProps> = ({ project, onSave, onDirtyChange }) => {
  const [draft, setDraft] = useState<BriefDraft>(() => projectToBrief(project));
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const baseline = projectToBrief(project);
  const isDirty = (Object.keys(baseline) as Array<keyof BriefDraft>)
    .some((field) => draft[field] !== baseline[field]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const updateField = (field: keyof BriefDraft, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setSaveStatus('idle');
    setError(null);
  };

  const handlePlatformChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === 'general' || value === 'xiaohongshu' || value === 'wechat') {
      setDraft((current) => ({ ...current, targetPlatform: value }));
      setSaveStatus('idle');
    }
  };

  const handleSave = async () => {
    if (!draft.title.trim()) {
      setError('请先填写项目名称');
      setSaveStatus('error');
      return;
    }
    setSaveStatus('saving');
    setError(null);
    try {
      const savedProject = await onSave({
        title: draft.title.trim(),
        topic: draft.topic.trim(),
        audience: draft.audience.trim(),
        goal: draft.goal.trim(),
        angle: draft.angle.trim(),
        tone: draft.tone.trim(),
        contentFormat: draft.contentFormat.trim(),
        targetPlatform: draft.targetPlatform,
        thesis: draft.thesis.trim(),
        personalPractice: draft.personalPractice.trim(),
        personalJudgment: draft.personalJudgment.trim(),
        discussionQuestion: draft.discussionQuestion.trim(),
      });
      setDraft(projectToBrief(savedProject));
      setSaveStatus('saved');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '保存 Brief 失败');
      setSaveStatus('error');
    }
  };

  const inputClass = 'mt-1 w-full rounded-xl border border-card-border bg-white/70 px-3.5 py-2.5 font-body text-[12px] text-ink outline-none transition-colors focus-visible:border-lilac focus-visible:ring-2 focus-visible:ring-lilac/35';

  return (
    <WorkbenchCard className="p-5" aria-labelledby="project-brief-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-lemon" />
            <h2 id="project-brief-title" className="ui-section-title">创作 Brief</h2>
          </div>
          <p className="ui-body mt-2 text-ink-soft/75">先明确写给谁、解决什么问题，再进入素材和写作。</p>
        </div>
        <span className="rounded-full bg-lemon/25 px-2.5 py-1 font-body text-[11px] text-ink">01 方向</span>
      </div>

      <fieldset disabled={saveStatus === 'saving'} className="contents disabled:cursor-wait disabled:opacity-65">
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label htmlFor="brief-title" className="ui-control-label text-ink-soft">
          项目名称
          <input id="brief-title" value={draft.title} onChange={(event) => updateField('title', event.target.value)} className={inputClass} />
        </label>
        <label htmlFor="brief-platform" className="ui-control-label text-ink-soft">
          目标平台
          <select id="brief-platform" value={draft.targetPlatform} onChange={handlePlatformChange} className={`${inputClass} appearance-none`}>
            {PLATFORM_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </label>
        <label htmlFor="brief-topic" className="ui-control-label text-ink-soft sm:col-span-2">
          核心问题
          <textarea id="brief-topic" rows={2} value={draft.topic} onChange={(event) => updateField('topic', event.target.value)} placeholder="这篇内容真正要回答什么？" className={`${inputClass} resize-y leading-relaxed`} />
        </label>
        <label htmlFor="brief-audience" className="ui-control-label text-ink-soft">
          目标读者
          <input id="brief-audience" value={draft.audience} onChange={(event) => updateField('audience', event.target.value)} placeholder="谁会因这篇内容受益？" className={inputClass} />
        </label>
        <label htmlFor="brief-goal" className="ui-control-label text-ink-soft">
          创作目标
          <input id="brief-goal" value={draft.goal} onChange={(event) => updateField('goal', event.target.value)} placeholder="读完后希望发生什么？" className={inputClass} />
        </label>
        <label htmlFor="brief-angle" className="ui-control-label text-ink-soft">
          内容角度
          <input id="brief-angle" value={draft.angle} onChange={(event) => updateField('angle', event.target.value)} placeholder="从什么切口展开？" className={inputClass} />
        </label>
        <label htmlFor="brief-tone" className="ui-control-label text-ink-soft">
          表达语气
          <input id="brief-tone" value={draft.tone} onChange={(event) => updateField('tone', event.target.value)} placeholder="例如：克制、具体、有个人感" className={inputClass} />
        </label>
        <label htmlFor="brief-format" className="ui-control-label text-ink-soft">
          内容形态
          <input id="brief-format" value={draft.contentFormat} onChange={(event) => updateField('contentFormat', event.target.value)} placeholder="例如：深度文章、短帖、口播" className={inputClass} />
        </label>
        <label htmlFor="brief-thesis" className="ui-control-label text-ink-soft">
          核心主张
          <input id="brief-thesis" value={draft.thesis} onChange={(event) => updateField('thesis', event.target.value)} placeholder="目前最想说清楚的一句话" className={inputClass} />
        </label>
      </div>

      <div className="mt-5 rounded-2xl border border-lemon/35 bg-lemon/10 p-4">
        <div>
          <h3 className="ui-section-title text-ink">你的经验与判断</h3>
          <p className="ui-body mt-1 text-ink-soft/70">
            来源回答“别人说了什么”，这里回答“你为什么有资格这样判断”。这些内容会进入创作上下文，但不会被 AI 自动替你填写。
          </p>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label htmlFor="brief-personal-practice" className="ui-control-label text-ink-soft sm:col-span-2">
            个人实践
            <textarea
              id="brief-personal-practice"
              rows={3}
              value={draft.personalPractice}
              onChange={(event) => updateField('personalPractice', event.target.value)}
              placeholder="你亲自做过什么、观察到什么？尽量写具体场景。"
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </label>
          <label htmlFor="brief-personal-judgment" className="ui-control-label text-ink-soft">
            个人判断
            <textarea
              id="brief-personal-judgment"
              rows={3}
              value={draft.personalJudgment}
              onChange={(event) => updateField('personalJudgment', event.target.value)}
              placeholder="基于这些材料，你自己的取舍和结论是什么？"
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </label>
          <label htmlFor="brief-discussion-question" className="ui-control-label text-ink-soft">
            留给读者的问题
            <textarea
              id="brief-discussion-question"
              rows={3}
              value={draft.discussionQuestion}
              onChange={(event) => updateField('discussionQuestion', event.target.value)}
              placeholder="什么问题能让读者把内容带回自己的处境？"
              className={`${inputClass} resize-y leading-relaxed`}
            />
          </label>
        </div>
      </div>
      </fieldset>

      {error && <p role="alert" className="mt-4 animate-shake rounded-xl border border-pink/25 bg-pink/10 p-3 ui-body text-ink">{error}</p>}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
        <span aria-live="polite" className="ui-metadata text-ink-soft/70">
          {isDirty ? 'Brief 有未保存修改' : saveStatus === 'saved' ? 'Brief 已保存' : '修改只会在点击保存后写入'}
        </span>
        <ActionButton tone="primary" isLoading={saveStatus === 'saving'} loadingLabel="正在保存 Brief…" onClick={() => void handleSave()}>
          保存 Brief
        </ActionButton>
      </div>
    </WorkbenchCard>
  );
};

export default ProjectBriefForm;
