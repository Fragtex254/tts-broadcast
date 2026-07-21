import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { ContentArtifactRevision, ContentSourceFragment } from '../../store';
import { ProjectCitationPanel } from './ProjectCitationPanel';

const revision: ContentArtifactRevision = {
  id: 31, artifact_id: 30, revision_number: 2, content: '主稿正文 [证据#5]', change_reason: 'ai_generated',
  parent_revision_id: 29, generation_job_id: 9, request_key: 'job-key',
  provenance: {
    blocks: [
      { basis: 'evidence', text: '来源直接支持的陈述', evidence_ids: [5] },
      { basis: 'creator', text: '我的判断', evidence_ids: [] },
      { basis: 'inference', text: '可能的延伸结论', evidence_ids: [5] },
    ],
    origin: 'ai', operation: 'generate_master', prompt_version: 'evidence-v1', model: 'test', provider: 'openai', input_fingerprint: 'fingerprint',
    creator_input_keys: ['personal_judgment'], creator_inputs: { personal_judgment: '我的判断' }, outline_revision_id: 21, evidence_ids: [5],
  },
  citations: [{
    id: 11, revision_id: 31, evidence_id: 5, marker: '[证据#5]', excerpt: '来源直接支持的陈述', source_id: 3,
    source_title: '已移出项目的访谈', source_content_sha256: 'sha', start_fragment_index: 1, end_fragment_index: 1,
    start_offset: 5, end_offset: 15, is_stale: false, source_linked: false, evidence_decision_state: 'selected',
    evidence_lifecycle_status: 'stale', reuse_eligible: false,
  }],
  citation_status: 'valid', created_at: '',
};

const fragments: ContentSourceFragment[] = [
  { index: 0, content: '上文背景', start_offset: 0, end_offset: 4 },
  { index: 1, content: '来源直接支持的陈述', start_offset: 5, end_offset: 15 },
  { index: 2, content: '下文限定条件', start_offset: 16, end_offset: 22 },
];

describe('ProjectCitationPanel', () => {
  test('来源移出后仍把历史引用完整性与当前复用资格分开表达，并可回原文上下文核验', async () => {
    const onFetchFragments = vi.fn().mockResolvedValue(fragments);
    render(<ProjectCitationPanel revision={revision} onFetchFragments={onFetchFragments} />);

    expect(screen.getByText('历史引用快照完整')).not.toBeNull();
    expect(screen.getByText(/来源已移出项目.*当前不可复用/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '核验已移出项目的访谈的引用原文' }));
    await waitFor(() => expect(onFetchFragments).toHaveBeenCalledWith(3));
    expect(await screen.findByRole('dialog', { name: '核验引用原文' })).not.toBeNull();
    expect(screen.getByText('上文背景')).not.toBeNull();
    expect(screen.getByText('下文限定条件')).not.toBeNull();
  });

  test('AI 推断只标参考上下文，不伪装成直接引文', () => {
    render(<ProjectCitationPanel revision={revision} onFetchFragments={vi.fn()} />);

    expect(screen.getByText('AI 推断，待核对')).not.toBeNull();
    expect(screen.getByText(/参考了证据上下文 #5，但不是直接引文/)).not.toBeNull();
    expect(screen.getByText('创作者输入')).not.toBeNull();
    expect(screen.getByText('原文逐字摘录（未核验）')).not.toBeNull();
  });

  test('历史模式明确展示该 Revision 自己的不可变快照', () => {
    render(<ProjectCitationPanel revision={revision} onFetchFragments={vi.fn()} isHistoricalRevision />);

    expect(screen.getByRole('heading', { name: '历史主稿的依据' })).not.toBeNull();
    expect(screen.getByText(/历史快照 · 主稿第 2 版/)).not.toBeNull();
  });
});
