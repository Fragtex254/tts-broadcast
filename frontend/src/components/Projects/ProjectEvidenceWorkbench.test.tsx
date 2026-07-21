import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ContentEvidence, ContentProjectSource, ContentSourceFragment } from '../../store';
import { ProjectEvidenceWorkbench } from './ProjectEvidenceWorkbench';

const source: ContentProjectSource = {
  id: 3, project_id: 12, project_source_id: 7, source_type: 'manual', title: '访谈原文', content: '第一段\n\n第二段', content_sha256: 'sha',
  url: '', external_ref: '', metadata: {}, usage_note: '', sort_order: 0, linked_at: '', link_updated_at: '', created_at: '', updated_at: '',
};

const evidence: ContentEvidence = {
  id: 5, project_id: 12, source_id: 3, source_title: '访谈原文', origin: 'ai', state: 'candidate',
  decision_state: 'candidate', lifecycle_status: 'active', source_linked: true, source_snapshot_intact: true, reuse_eligible: false, unavailable_reason: 'not_selected', start_fragment_index: 0, end_fragment_index: 0,
  start_offset: 0, end_offset: 3, excerpt: '第一段', source_content_sha256: 'sha', ai_note: '这可能支持核心判断',
  user_note: '', supersedes_id: null, generation_job_id: 9, sort_order: 0, created_at: '', updated_at: '',
};

const fragments: ContentSourceFragment[] = [
  { index: 0, content: '第一段', start_offset: 0, end_offset: 3 },
  { index: 1, content: '第二段', start_offset: 5, end_offset: 8 },
];

const baseProps = {
  sources: [source],
  evidence: [evidence],
  fragmentsBySource: { 3: fragments },
  isLoadingFragments: false,
  fragmentsError: null,
  activeJob: null,
  activeOperation: null,
  error: null,
  onFetchFragments: vi.fn().mockResolvedValue(fragments),
  onCreateManual: vi.fn().mockResolvedValue({ ...evidence, id: 6, origin: 'user', ai_note: '', user_note: '我的现场判断' }),
  onUpdate: vi.fn().mockResolvedValue(evidence),
  onStartExtraction: vi.fn().mockResolvedValue(undefined),
};

describe('ProjectEvidenceWorkbench', () => {
  test('候选证据明确区分 AI 说明、来源原文和创作者判断，并由用户采用', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...evidence, decision_state: 'selected', state: 'selected' });
    render(<ProjectEvidenceWorkbench {...baseProps} onUpdate={onUpdate} />);

    expect(screen.getByText('AI 提取说明（不是来源事实）')).not.toBeNull();
    expect(screen.getByText('原文摘录（未核验）')).not.toBeNull();
    expect(screen.getByText('创作者判断（由你填写）')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '采用这条证据' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(5, { state: 'selected' }));
  });

  test('手工定位只提交 fragment index，并在一个幂等事务内保存和采用', async () => {
    const onCreateManual = vi.fn().mockResolvedValue({ ...evidence, id: 6, origin: 'user', decision_state: 'selected', state: 'selected', reuse_eligible: true, unavailable_reason: '' });
    const onUpdate = vi.fn();
    render(<ProjectEvidenceWorkbench {...baseProps} onCreateManual={onCreateManual} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByRole('button', { name: '从原文手工定位' }));
    fireEvent.change(screen.getByRole('combobox', { name: '选择来源' }), { target: { value: '3' } });
    fireEvent.change(screen.getByRole('combobox', { name: '结束片段' }), { target: { value: '1' } });
    fireEvent.change(screen.getByRole('textbox', { name: '创作者判断（可选）' }), { target: { value: '\n我的现场判断\n' } });
    fireEvent.click(screen.getByRole('button', { name: '保存并采用证据' }));

    await waitFor(() => expect(onCreateManual).toHaveBeenCalledWith({
      sourceId: 3,
      startFragmentIndex: 0,
      endFragmentIndex: 1,
      decisionState: 'selected',
      userNote: '\n我的现场判断\n',
    }));
    expect(onUpdate).not.toHaveBeenCalled();
  });

  test('保留历史采用决定，但 stale 证据明确不可用于新生成', () => {
    render(
      <ProjectEvidenceWorkbench
        {...baseProps}
        evidence={[{ ...evidence, state: 'selected', decision_state: 'selected', lifecycle_status: 'stale', reuse_eligible: false, unavailable_reason: 'stale' }]}
      />
    );

    expect(screen.getByText('曾采用 · 当前不可复用')).not.toBeNull();
    expect(screen.getByText(/证据当前不可复用/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: '取消采用' })).toBeNull();
  });

  test('更新创作者判断时原样保留首尾换行', async () => {
    const onUpdate = vi.fn().mockResolvedValue({ ...evidence, user_note: '\n保留格式\n' });
    render(<ProjectEvidenceWorkbench {...baseProps} onUpdate={onUpdate} />);
    fireEvent.change(screen.getByRole('textbox', { name: '创作者判断（由你填写）' }), { target: { value: '\n保留格式\n' } });
    fireEvent.click(screen.getByRole('button', { name: '保存创作者判断' }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith(5, { userNote: '\n保留格式\n' }));
  });

  test('修正候选范围时创建 superseding 新卡，不覆盖旧摘录', async () => {
    const corrected = { ...evidence, id: 7, origin: 'user' as const, start_fragment_index: 0, end_fragment_index: 1, excerpt: '第一段\n\n第二段', supersedes_id: 5 };
    const onCreateManual = vi.fn().mockResolvedValue(corrected);
    render(<ProjectEvidenceWorkbench {...baseProps} onCreateManual={onCreateManual} />);

    fireEvent.click(screen.getByRole('button', { name: '修正原文范围' }));
    expect(screen.getByText('正在修正证据 #5')).not.toBeNull();
    expect(screen.getByText(/旧卡只标记为“已被修正”/)).not.toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: '结束片段' }), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: '保存修正后的证据' }));

    await waitFor(() => expect(onCreateManual).toHaveBeenCalledWith({
      sourceId: 3,
      startFragmentIndex: 0,
      endFragmentIndex: 1,
      decisionState: 'candidate',
      userNote: '',
      supersedesEvidenceId: 5,
    }));
    expect(screen.getAllByText('第一段').length).toBeGreaterThan(0);
  });

  test('判断草稿接入未保存状态，保存失败后不清空片段选择和文本', async () => {
    const onDirtyChange = vi.fn();
    const onCreateManual = vi.fn().mockRejectedValue(new Error('网络中断'));
    render(
      <ProjectEvidenceWorkbench
        {...baseProps}
        onCreateManual={onCreateManual}
        onDirtyChange={onDirtyChange}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '从原文手工定位' }));
    fireEvent.change(screen.getByRole('combobox', { name: '选择来源' }), { target: { value: '3' } });
    expect(screen.getAllByRole('option', { name: '片段 1 · 第一段' })).toHaveLength(2);
    fireEvent.change(screen.getByRole('textbox', { name: '创作者判断（可选）' }), { target: { value: '不要丢掉这条判断' } });
    await waitFor(() => expect(onDirtyChange).toHaveBeenLastCalledWith(true));
    fireEvent.click(screen.getByRole('button', { name: '保存并采用证据' }));

    expect(await screen.findByRole('alert')).not.toBeNull();
    expect((screen.getByRole('textbox', { name: '创作者判断（可选）' }) as HTMLTextAreaElement).value).toBe('不要丢掉这条判断');
    expect((screen.getByRole('combobox', { name: '选择来源' }) as HTMLSelectElement).value).toBe('3');
  });

  test('可选启动 AI 提取并展示真实任务阶段，不伪造进度', () => {
    const onStartExtraction = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ProjectEvidenceWorkbench {...baseProps} evidence={[]} onStartExtraction={onStartExtraction} />);
    const startButton = screen.getByRole('button', { name: 'AI 提取候选证据' });
    expect(startButton.matches(':disabled')).toBe(true);
    fireEvent.click(screen.getByRole('checkbox', { name: '允许发送来源：访谈原文' }));
    fireEvent.click(startButton);
    expect(onStartExtraction).toHaveBeenCalledWith([3]);

    rerender(<ProjectEvidenceWorkbench {...baseProps} activeOperation="extract_evidence" activeJob={{
      id: 10, project_id: 12, operation: 'extract_evidence', request_key: 'job', status: 'running', phase: 'extracting',
      progress: null, error: '', result_artifact_id: null, result_revision_id: null, created_at: '', updated_at: '',
    }} />);
    expect(screen.getByText(/正在提取候选证据/)).not.toBeNull();
    expect(screen.queryByText('%')).toBeNull();
  });

  test('Brief 或证据判断未保存时阻止 AI 提取并给出明确恢复路径', async () => {
    const { rerender } = render(
      <ProjectEvidenceWorkbench {...baseProps} hasUnsavedBrief />
    );
    fireEvent.click(screen.getByRole('checkbox', { name: '允许发送来源：访谈原文' }));
    expect(screen.getByRole('button', { name: 'AI 提取候选证据' }).matches(':disabled')).toBe(true);
    expect(screen.getByText(/先保存 Brief/)).not.toBeNull();

    rerender(<ProjectEvidenceWorkbench {...baseProps} />);
    fireEvent.change(screen.getByRole('textbox', { name: '创作者判断（由你填写）' }), { target: { value: '尚未保存的判断' } });
    await waitFor(() => expect(screen.getByText(/先保存证据判断/)).not.toBeNull());
    expect(screen.getByRole('button', { name: 'AI 提取候选证据' }).matches(':disabled')).toBe(true);
  });
});
