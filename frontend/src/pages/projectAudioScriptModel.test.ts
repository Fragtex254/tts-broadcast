import { describe, expect, test } from 'vitest';
import type { ContentArtifact, ContentArtifactRevision } from '../store';
import { CONTENT_REVISION_DEFAULTS } from '../test/contentProjectFixtures';
import { getAudioScriptPreparationPlan } from './projectAudioScriptModel';

const masterRevision: ContentArtifactRevision = {
  ...CONTENT_REVISION_DEFAULTS,
  id: 11,
  artifact_id: 4,
  revision_number: 3,
  content: '\n主稿原文\n',
  change_reason: '定稿',
  created_at: '2026-07-18T00:00:00.000Z',
};

const audioRevision: ContentArtifactRevision = {
  ...CONTENT_REVISION_DEFAULTS,
  id: 21,
  artifact_id: 8,
  revision_number: 2,
  content: '\n旧口播稿\n',
  change_reason: '旧版本',
  created_at: '2026-07-18T00:00:00.000Z',
};

const audioScript: ContentArtifact = {
  id: 8,
  project_id: 2,
  kind: 'audio_script',
  title: '口播稿',
  platform: 'general',
  status: 'draft',
  current_revision: audioRevision,
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
};

describe('getAudioScriptPreparationPlan', () => {
  test('没有口播 Artifact 时从主稿原文创建首版', () => {
    expect(getAudioScriptPreparationPlan(masterRevision, null)).toEqual({
      action: 'create',
      content: '\n主稿原文\n',
      changeReason: '从主稿第 3 版创建口播稿',
    });
  });

  test('已有口播当前版本时默认继续创作者改过的口语稿', () => {
    expect(getAudioScriptPreparationPlan(masterRevision, audioScript)).toEqual({
      action: 'reuse',
      artifactId: audioScript.id,
      revision: audioRevision,
    });
  });

  test('只有显式同步主稿时才追加口播版本且不 trim 正文', () => {
    expect(getAudioScriptPreparationPlan(masterRevision, audioScript, 'sync-master')).toEqual({
      action: 'revise',
      artifactId: audioScript.id,
      content: '\n主稿原文\n',
      changeReason: '同步自主稿第 3 版',
    });
  });
});
