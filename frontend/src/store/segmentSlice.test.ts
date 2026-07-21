import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  generate: vi.fn(),
  split: vi.fn(),
  updateVoiceConfig: vi.fn(),
  batchGenerateSegments: vi.fn(),
  getSegments: vi.fn(),
}));

const sseMocks = vi.hoisted(() => ({
  create: vi.fn(),
  handlers: new Map<string, (event: unknown) => void>(),
  close: vi.fn(),
  connect: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    broadcastApi: {
      ...actual.broadcastApi,
      generate: apiMocks.generate,
      split: apiMocks.split,
      updateVoiceConfig: apiMocks.updateVoiceConfig,
      batchGenerateSegments: apiMocks.batchGenerateSegments,
      getSegments: apiMocks.getSegments,
    },
  };
});

vi.mock('../services/sseClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/sseClient')>();
  return {
    ...actual,
    createSSEClient: sseMocks.create,
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
    sseMocks.handlers.clear();
    sseMocks.create.mockReturnValue({
      on: (eventType: string, handler: (event: unknown) => void) => {
        sseMocks.handlers.set(eventType, handler);
      },
      connect: sseMocks.connect,
      close: sseMocks.close,
    });
    apiMocks.generate.mockResolvedValue({ data: { broadcast } });
    apiMocks.split.mockResolvedValue({ data: { broadcast: { ...broadcast, status: 'pending' }, segments: [] } });
    apiMocks.updateVoiceConfig.mockResolvedValue({ data: { broadcast } });
    useStore.setState({
      currentBroadcast: broadcast,
      broadcasts: [],
      segments: [],
      backgroundTasks: [],
      isSplitting: false,
      voiceConfig: {
        ...useStore.getState().voiceConfig,
        voiceType: 'preset',
        voice: '冰糖',
      },
    });
  });

  test('项目口播切分复用 URL 当前 Broadcast，不再创建第二条记录', async () => {
    await useStore.getState().splitScriptAction('口播正文', 21);

    expect(apiMocks.generate).not.toHaveBeenCalled();
    expect(apiMocks.split).toHaveBeenCalledWith(51);
    expect(useStore.getState().currentBroadcast?.id).toBe(51);
  });

  test('非项目草稿也切分 URL 当前 Broadcast', async () => {
    useStore.setState({
      currentBroadcast: {
        ...broadcast,
        content: '临时口播正文',
        artifact_revision_id: null,
        source_artifact_revision_id: null,
      },
    });
    await useStore.getState().splitScriptAction('临时口播正文');

    expect(apiMocks.generate).not.toHaveBeenCalled();
    expect(apiMocks.split).toHaveBeenCalledWith(51);
  });

  test('同一播报已有后台生成任务时拒绝重复启动且保留旧连接', async () => {
    useStore.getState().startBackgroundTask({
      taskId: String(broadcast.id),
      kind: 'segment-generation',
      entityId: broadcast.id,
      title: '生成分段语音',
      href: '/editor/51',
      status: 'running',
    });

    await expect(useStore.getState().batchGenerateSegments(broadcast.id)).rejects.toThrow(
      '该播报正在后台生成分段语音'
    );

    expect(apiMocks.updateVoiceConfig).not.toHaveBeenCalled();
    expect(sseMocks.create).not.toHaveBeenCalled();
    expect(useStore.getState().backgroundTasks).toHaveLength(1);
  });

  test('旧播报请求失败不会把当前播报的 generating 段落标记失败', async () => {
    const currentBroadcast = { ...broadcast, id: 52 };
    const currentSegment = {
      id: 520,
      broadcast_id: 52,
      index: 0,
      text: '当前播报段落',
      audio_path: null,
      status: 'generating' as const,
      style_tag: '',
      playback_rate: 1,
      error_message: '',
      created_at: '',
      updated_at: '',
    };
    apiMocks.batchGenerateSegments.mockRejectedValue(new Error('旧任务失败'));
    apiMocks.getSegments.mockRejectedValue(new Error('旧播报也无法补拉'));
    useStore.setState({ currentBroadcast, segments: [currentSegment] });

    await expect(useStore.getState().batchGenerateSegments(broadcast.id)).rejects.toThrow('旧任务失败');

    const taskId = sseMocks.create.mock.calls[0]?.[0];
    expect(taskId).toMatch(/^segment-51-/);
    expect(apiMocks.batchGenerateSegments).toHaveBeenCalledWith(broadcast.id, taskId);
    expect(useStore.getState().segments).toEqual([currentSegment]);
    expect(useStore.getState().backgroundTasks).toEqual([]);
  });
});
