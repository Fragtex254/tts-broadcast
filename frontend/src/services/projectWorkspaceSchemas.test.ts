import { describe, expect, test } from 'vitest';
import {
  ContentArtifactRevisionSchema,
  ContentEvidenceSchema,
  ContentGenerationJobSchema,
  ContentProjectMilestoneSchema,
  safeParseStrict,
} from './schemas';

describe('内容创作工作区 schema', () => {
  test('严格解析可追溯证据、生成任务与唯一里程碑', () => {
    const evidence = safeParseStrict(ContentEvidenceSchema, {
      id: 1, project_id: 2, source_id: 3, source_title: '原始访谈', origin: 'ai', state: 'candidate', decision_state: 'candidate',
      lifecycle_status: 'active', source_linked: true, source_snapshot_intact: true, reuse_eligible: false, unavailable_reason: 'not_selected',
      start_fragment_index: 0, end_fragment_index: 1, start_offset: 0, end_offset: 12,
      excerpt: '这是原文摘录', source_content_sha256: 'sha', ai_note: 'AI 提取说明', user_note: '',
      supersedes_id: null, generation_job_id: 4, sort_order: 0, created_at: '', updated_at: '',
    });
    const job = safeParseStrict(ContentGenerationJobSchema, {
      id: 4, project_id: 2, operation: 'extract_evidence', request_key: 'request-1', status: 'running',
      phase: 'extracting', progress: null, error: '', result_artifact_id: null, result_revision_id: null,
      created_at: '', updated_at: '',
    });
    const milestone = safeParseStrict(ContentProjectMilestoneSchema, {
      id: 'milestone-1', kind: 'evidence_selected', title: '证据已确认', description: '可开始组织提纲。',
    });

    expect(evidence.state).toBe('candidate');
    expect(job.progress).toBeNull();
    expect(milestone.id).toBe('milestone-1');
  });

  test('旧 Revision 默认无 provenance，并保留 stale 引用事实', () => {
    const legacy = safeParseStrict(ContentArtifactRevisionSchema, {
      id: 1, artifact_id: 2, revision_number: 1, content: '旧正文', change_reason: 'manual', created_at: '',
    });
    const cited = safeParseStrict(ContentArtifactRevisionSchema, {
      id: 2, artifact_id: 2, revision_number: 2, content: '新正文 [E1]', change_reason: '生成主稿', created_at: '',
      provenance: { blocks: [{ basis: 'inference', text: '这是 AI 推断', evidence_ids: [] }] },
      parent_revision_id: 1, generation_job_id: 8, request_key: 'revision-key',
      citations: [{
        id: 1, revision_id: 2, evidence_id: 1, marker: '[证据#1]', excerpt: '原文', source_id: 3, source_title: '来源',
        source_content_sha256: 'old', start_fragment_index: 0, end_fragment_index: 0, start_offset: 0, end_offset: 2,
        is_stale: true, source_linked: false, evidence_decision_state: 'selected', evidence_lifecycle_status: 'stale', reuse_eligible: false,
      }],
      citation_status: 'stale',
    });

    expect(legacy.provenance).toEqual({
      blocks: [], origin: 'manual', operation: 'manual_save', prompt_version: '', model: '', provider: '', input_fingerprint: '',
      creator_input_keys: [], creator_inputs: {}, outline_revision_id: null, evidence_ids: [],
    });
    expect(legacy.citations).toEqual([]);
    expect(legacy.citation_status).toBe('not_applicable');
    expect(cited.citations[0].is_stale).toBe(true);
    expect(cited.request_key).toBe('revision-key');
    expect(cited.provenance.blocks[0].basis).toBe('inference');
  });
});
