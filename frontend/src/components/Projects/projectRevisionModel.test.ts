import { describe, expect, test } from 'vitest';
import type { ContentArtifactRevision } from '../../store';
import { CONTENT_REVISION_DEFAULTS } from '../../test/contentProjectFixtures';
import { isRevisionConfirmedForOutput, revisionOriginLabel } from './projectRevisionModel';

const manualRevision: ContentArtifactRevision = {
  ...CONTENT_REVISION_DEFAULTS,
  id: 1,
  artifact_id: 2,
  revision_number: 1,
  content: '正文',
  change_reason: '',
  created_at: '',
};

describe('project revision model', () => {
  test('只有后续显式人工保存的 Revision 才可视为输出确认', () => {
    const aiRevision: ContentArtifactRevision = {
      ...manualRevision,
      generation_job_id: 8,
      provenance: { ...manualRevision.provenance, origin: 'ai', operation: 'generate_master' },
    };

    expect(isRevisionConfirmedForOutput(aiRevision)).toBe(false);
    expect(revisionOriginLabel(aiRevision)).toBe('AI 生成草案');
    expect(isRevisionConfirmedForOutput(manualRevision)).toBe(true);
    expect(revisionOriginLabel(manualRevision)).toBe('人工保存版本');
  });
});
