import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ContentArtifact, ContentEvidence, ContentProject } from '../../store';
import { CONTENT_REVISION_DEFAULTS } from '../../test/contentProjectFixtures';
import { ProjectOutlineEditor } from './ProjectOutlineEditor';

const project: ContentProject = {
  id: 12, title: '证据写作', topic: 'AI 创作', audience: '', goal: '', angle: '', tone: '', content_format: '', target_platform: 'general',
  thesis: 'AI 不替代判断', personal_practice: '我采访过十位创作者。', personal_judgment: '工具必须允许人工完成。', discussion_question: '',
  status: 'draft', claims: [], created_at: '', updated_at: '',
};

const selectedEvidence: ContentEvidence = {
  id: 5, project_id: 12, source_id: 3, source_title: '访谈', origin: 'user', state: 'selected', decision_state: 'selected', lifecycle_status: 'active',
  source_linked: true, source_snapshot_intact: true, reuse_eligible: true, unavailable_reason: '',
  start_fragment_index: 0, end_fragment_index: 0, start_offset: 0, end_offset: 3, excerpt: '原文', source_content_sha256: 'sha', ai_note: '',
  user_note: '支持核心判断', supersedes_id: null, generation_job_id: null, sort_order: 0, created_at: '', updated_at: '',
};

const outline: ContentArtifact = {
  id: 20, project_id: 12, kind: 'outline', title: '创作提纲', platform: 'general', status: 'draft', created_at: '', updated_at: '',
  current_revision: {
    ...CONTENT_REVISION_DEFAULTS,
    id: 21, artifact_id: 20, revision_number: 2, content: '一、问题\n二、证据', change_reason: 'ai_generated', generation_job_id: 8,
    created_at: '',
  },
};

const baseProps = {
  project,
  artifact: null,
  revisions: [],
  selectedEvidence: [],
  activeJob: null,
  activeOperation: null,
  isSaving: false,
  saveError: null,
  jobError: null,
  onSave: vi.fn().mockResolvedValue(undefined),
  onGenerateOutline: vi.fn().mockResolvedValue(undefined),
  onGenerateMaster: vi.fn().mockResolvedValue(undefined),
  onDirtyChange: vi.fn(),
};

describe('ProjectOutlineEditor', () => {
  test('AI 不可用时仍可手工保存不可变提纲 Revision', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<ProjectOutlineEditor {...baseProps} onSave={onSave} />);
    fireEvent.change(screen.getByRole('textbox', { name: '提纲正文' }), { target: { value: '一、我的判断' } });
    fireEvent.click(screen.getByRole('button', { name: '建立第一版提纲' }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ content: '一、我的判断', changeReason: '' }));
  });

  test('创作者输入默认不发送，只有显式勾选项进入 AI 请求', () => {
    const onGenerateOutline = vi.fn().mockResolvedValue(undefined);
    render(<ProjectOutlineEditor {...baseProps} selectedEvidence={[selectedEvidence]} onGenerateOutline={onGenerateOutline} />);

    expect(screen.getByText('我采访过十位创作者。')).not.toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: '带入个人实践' }));
    fireEvent.click(screen.getByRole('button', { name: '生成可审阅提纲草案' }));

    expect(onGenerateOutline).toHaveBeenCalledWith([5], ['personal_practice']);
  });

  test('生成主稿前必须显式选择确切提纲 Revision', () => {
    const onGenerateMaster = vi.fn().mockResolvedValue(undefined);
    const previousRevision = { ...outline.current_revision!, id: 20, revision_number: 1, content: '旧提纲' };
    render(
      <ProjectOutlineEditor
        {...baseProps}
        artifact={outline}
        revisions={[outline.current_revision!, previousRevision]}
        selectedEvidence={[selectedEvidence]}
        onGenerateMaster={onGenerateMaster}
      />
    );

    expect(screen.getByText('AI 草案待确认')).not.toBeNull();
    const generate = screen.getByRole('button', { name: '生成带引用的主稿草案' });
    expect(generate.matches(':disabled')).toBe(true);
    fireEvent.change(screen.getByRole('combobox', { name: '用于生成主稿的提纲版本' }), { target: { value: '20' } });
    expect(screen.getByRole('region', { name: '已选提纲版本预览' }).textContent).toContain('旧提纲');
    expect(screen.getByRole('region', { name: '已选提纲版本预览' }).textContent).toContain('AI 生成草案');
    expect(generate.matches(':disabled')).toBe(false);
    fireEvent.click(generate);
    expect(onGenerateMaster).toHaveBeenCalledWith(20, [5], []);
  });

  test('相关 Brief、证据、提纲或主稿草稿未保存时阻止 AI 生成并解释原因', () => {
    const { rerender } = render(
      <ProjectOutlineEditor
        {...baseProps}
        selectedEvidence={[selectedEvidence]}
        hasUnsavedBrief
      />
    );

    expect(screen.getByText(/先保存 Brief/)).not.toBeNull();
    expect(screen.getByRole('button', { name: '生成可审阅提纲草案' }).matches(':disabled')).toBe(true);

    rerender(
      <ProjectOutlineEditor
        {...baseProps}
        artifact={outline}
        revisions={[outline.current_revision!]}
        selectedEvidence={[selectedEvidence]}
        hasUnsavedEvidence
        hasUnsavedMasterDraft
      />
    );
    fireEvent.change(screen.getByRole('combobox', { name: '用于生成主稿的提纲版本' }), { target: { value: '21' } });
    expect(screen.getByText(/先保存证据判断/)).not.toBeNull();
    expect(screen.getByText(/先保存主稿草稿/)).not.toBeNull();
    expect(screen.getByRole('button', { name: '生成带引用的主稿草案' }).matches(':disabled')).toBe(true);
  });

  test('提纲有未保存修改时禁用提纲生成，生成提纲期间锁定目标编辑区', () => {
    const { rerender } = render(<ProjectOutlineEditor {...baseProps} selectedEvidence={[selectedEvidence]} />);
    fireEvent.change(screen.getByRole('textbox', { name: '提纲正文' }), { target: { value: '尚未保存的提纲' } });

    expect(screen.getByRole('button', { name: '生成可审阅提纲草案' }).matches(':disabled')).toBe(true);
    expect(screen.getByText(/先保存提纲草稿/)).not.toBeNull();

    rerender(
      <ProjectOutlineEditor
        {...baseProps}
        selectedEvidence={[selectedEvidence]}
        activeOperation="generate_outline"
      />
    );
    expect(screen.getByRole('textbox', { name: '提纲正文' }).matches(':disabled')).toBe(true);
    expect(screen.getByText(/提纲生成期间已锁定编辑区/)).not.toBeNull();
  });

  test('只填写提纲修改说明也视为未保存并阻止 AI 读取旧上下文', async () => {
    const onDirtyChange = vi.fn();
    render(
      <ProjectOutlineEditor
        {...baseProps}
        artifact={outline}
        revisions={[outline.current_revision!]}
        selectedEvidence={[selectedEvidence]}
        onDirtyChange={onDirtyChange}
      />
    );

    fireEvent.change(screen.getByRole('textbox', { name: '本次修改说明（可选）' }), { target: { value: '调整论证顺序' } });

    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    expect(screen.getByRole('button', { name: '生成可审阅提纲草案' }).matches(':disabled')).toBe(true);
    expect(screen.getByText(/先保存提纲草稿/)).not.toBeNull();
  });
});
