import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  generate: vi.fn(),
  split: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    broadcastApi: {
      ...actual.broadcastApi,
      generate: apiMocks.generate,
      split: apiMocks.split,
    },
  };
});

import useStore, { type Broadcast } from './index';

const broadcast: Broadcast = {
  id: 51,
  title: '项目口播',
  content: '口播正文',
  artifact_revision_id: 21,
  source_artifact_revision_id: 21,
  audio_path: null,
  duration: null,
  voice_type: 'preset',
  voice_config: '{}',
  source_items: null,
  status: 'draft',
  saved: 0,
  mode: 'segmented',
  created_at: '2026-07-18T00:00:00.000Z',
  updated_at: '2026-07-18T00:00:00.000Z',
};

describe('segmentSlice provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.generate.mockResolvedValue({ data: { broadcast } });
    apiMocks.split.mockResolvedValue({ data: { segments: [] } });
    useStore.setState({
      currentBroadcast: null,
      broadcasts: [],
      segments: [],
      isSplitting: false,
      voiceConfig: {
        ...useStore.getState().voiceConfig,
        voiceType: 'preset',
        voice: '冰糖',
      },
    });
  });

  test('项目口播切分把 artifactRevisionId 透传给 generate', async () => {
    await useStore.getState().splitScriptAction('口播正文', 21);

    expect(apiMocks.generate).toHaveBeenCalledWith(expect.objectContaining({
      text: '口播正文',
      mode: 'segmented',
      artifactRevisionId: 21,
    }));
  });

  test('旧编辑器切分不伪造 artifactRevisionId', async () => {
    await useStore.getState().splitScriptAction('旧口播正文');

    expect(apiMocks.generate.mock.calls[0][0]).not.toHaveProperty('artifactRevisionId');
  });
});
