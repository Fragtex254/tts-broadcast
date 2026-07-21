import { describe, expect, test } from 'vitest';
import type { ContentArtifact } from '../../store';
import { selectCanonicalProjectArtifact } from './projectArtifactModel';

const artifact = (id: number, kind: string, updatedAt: string): ContentArtifact => ({
  id,
  project_id: 1,
  kind,
  title: `${kind}-${id}`,
  platform: 'general',
  status: 'draft',
  current_revision: null,
  created_at: '2026-07-19T00:00:00.000Z',
  updated_at: updatedAt,
});

describe('selectCanonicalProjectArtifact', () => {
  test('多个同类稿件时固定选择最早 ID，不受工作区 updated_at 排序影响', () => {
    const newestButLaterId = artifact(9, 'outline', '2026-07-19T02:00:00.000Z');
    const earliestId = artifact(3, 'outline', '2026-07-19T01:00:00.000Z');
    const master = artifact(1, 'master', '2026-07-19T03:00:00.000Z');

    expect(selectCanonicalProjectArtifact([newestButLaterId, master, earliestId], 'outline')?.id).toBe(3);
    expect(selectCanonicalProjectArtifact([master], 'outline')).toBeNull();
  });
});
