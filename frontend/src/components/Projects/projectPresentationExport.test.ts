import { describe, expect, test } from 'vitest';
import type { ContentRevisionCitation } from '../../store';
import { createProjectPresentationExport } from './projectPresentationExport';

const citation = (id: number, marker: string, sourceTitle: string, excerpt: string): ContentRevisionCitation => ({
  id,
  revision_id: 9,
  evidence_id: id,
  marker,
  excerpt,
  source_id: id,
  source_title: sourceTitle,
  source_content_sha256: 'sha',
  start_fragment_index: 0,
  end_fragment_index: 0,
  start_offset: 0,
  end_offset: excerpt.length,
  evidence_decision_state: 'selected',
  evidence_lifecycle_status: 'active',
  source_linked: true,
  reuse_eligible: true,
  is_stale: false,
});

describe('project presentation export', () => {
  test('按正文首次出现顺序把内部证据 ID 转为稳定引用编号，并附去重依据', () => {
    const result = createProjectPresentationExport(
      '先说 B [证据#8]，再说 A [证据#3]，再次引用 B [证据#8]。',
      [citation(3, '[证据#3]', '来源 A', '摘录 A'), citation(8, '[证据#8]', '来源 B', '摘录 B')]
    );

    expect(result.isReady).toBe(true);
    expect(result.content).toContain('先说 B [引用 1]，再说 A [引用 2]，再次引用 B [引用 1]。');
    expect(result.content).toContain('## 参考依据');
    expect(result.content.indexOf('来源 B')).toBeLessThan(result.content.indexOf('来源 A'));
    expect(result.content.match(/来源 B/g)).toHaveLength(1);
    expect(result.content).not.toContain('[证据#');
  });

  test('存在没有快照的内部标记时阻止对外输出', () => {
    const result = createProjectPresentationExport('待核验 [证据#99]', []);

    expect(result.isReady).toBe(false);
    expect(result.error).toContain('引用快照不完整');
  });
});
