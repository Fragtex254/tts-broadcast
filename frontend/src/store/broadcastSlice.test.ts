import { beforeEach, describe, expect, test, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  createDraft: vi.fn(),
  forkDraft: vi.fn(),
  getDetail: vi.fn(),
  getSegments: vi.fn(),
  updateDraft: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/api')>();
  return {
    ...actual,
    broadcastApi: {
      ...actual.broadcastApi,
      createDraft: apiMocks.createDraft,
      forkDraft: apiMocks.forkDraft,
      getDetail: apiMocks.getDetail,
      getSegments: apiMocks.getSegments,
      updateDraft: apiMocks.updateDraft,
    },
  };
});

import useStore, { type Broadcast, type ContentArtifactRevision, type Segment } from './index';
import { CONTENT_REVISION_DEFAULTS } from '../test/contentProjectFixtures';
import { markSegmentEntityChanged } from './segmentEntityVersion';

const revision: ContentArtifactRevision = {
  ...CONTENT_REVISION_DEFAULTS,
  id: 21,
  artifact_id: 8,
  revision_number: 2,
  content: '项目口播正文',
  change_reason: '准备口播',
  created_at: '2026-07-18T00:00:00.000Z',
};

function makeBroadcast(id: number, overrides: Partial<Broadcast> = {}): Broadcast {
  return {
    id,
    title: `口播 ${id}`,
    content: `正文 ${id}`,
    artifact_revision_id: null,
    source_artifact_revision_id: null,
    audio_path: null,
    duration: null,
    voice_type: 'preset',
    voice_config: '{"voice":"冰糖"}',
    source_items: null,
    status: 'draft',
    saved: 0,
    mode: 'segmented',
    created_at: '2026-07-18T00:00:00.000Z',
    updated_at: '2026-07-18T00:00:00.000Z',
    ...overrides,
  };
}

function makeSegment(broadcastId: number): Segment {
  return {
    id: broadcastId * 10,
    broadcast_id: broadcastId,
    index: 0,
    text: `分段 ${broadcastId}`,
    audio_path: null,
    status: 'pending',
    style_tag: '',
    playback_rate: 1,
    error_message: '',
    created_at: '2026-07-18T00:00:00.000Z',
    updated_at: '2026-07-18T00:00:00.000Z',
  };
}

const voiceConfig = {
  voice: '冰糖',
  voiceType: 'preset' as const,
  voiceDesign: '',
  voiceClone: '',
  stylePrompt: '平静',
  optimizeTextPreview: false,
  speed: null,
  emotion: null,
  pitch: null,
};

function detailPayload(broadcast: Broadcast, segments: Segment[] = []) {
  return {
    broadcast,
    voiceConfig,
    sourceRevisionContext: broadcast.source_artifact_revision_id ? {
      projectId: 2,
      artifactId: 8,
      revision,
    } : null,
    segments,
    splitInProgress: false,
  };
}

describe('broadcastSlice editor URL state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useStore.getState().clearEditorBroadcast();
    useStore.setState({ isCreatingEditorDraft: false });
  });

  test('按 URL ID 原子恢复正文、分段、音色和来源 Revision', async () => {
    const broadcast = makeBroadcast(51, {
      content: revision.content,
      artifact_revision_id: revision.id,
      source_artifact_revision_id: revision.id,
    });
    const segment = makeSegment(51);
    apiMocks.getDetail.mockResolvedValue({ data: detailPayload(broadcast, [segment]) });

    await useStore.getState().loadEditorBroadcast(51);

    expect(apiMocks.getDetail).toHaveBeenCalledWith(51);
    expect(apiMocks.getSegments).not.toHaveBeenCalled();
    expect(useStore.getState()).toMatchObject({
      currentBroadcast: broadcast,
      script: revision.content,
      segments: [segment],
      voiceConfig,
      projectEditorContext: { projectId: 2, artifactId: 8, revision },
      isLoadingEditorBroadcast: false,
      editorBroadcastError: null,
    });
  });

  test('聚合详情失败时不保留上一份编辑器半状态', async () => {
    useStore.setState({
      currentBroadcast: makeBroadcast(40),
      script: '旧正文',
      segments: [makeSegment(40)],
    });
    apiMocks.getDetail.mockRejectedValue(new Error('editor snapshot unavailable'));

    await expect(useStore.getState().loadEditorBroadcast(52)).rejects.toThrow('加载口播稿失败');

    expect(useStore.getState()).toMatchObject({
      currentBroadcast: null,
      script: '',
      segments: [],
      isLoadingEditorBroadcast: false,
      editorBroadcastError: '加载口播稿失败，请稍后重试',
    });
  });

  test('聚合快照缺少 segments 时显式失败，不当作空编辑器', async () => {
    const payload = detailPayload(makeBroadcast(53));
    const malformed = {
      broadcast: payload.broadcast,
      voiceConfig: payload.voiceConfig,
      sourceRevisionContext: payload.sourceRevisionContext,
      splitInProgress: payload.splitInProgress,
    };
    apiMocks.getDetail.mockResolvedValue({ data: malformed });

    await expect(useStore.getState().loadEditorBroadcast(53)).rejects.toThrow('加载口播稿失败');

    expect(useStore.getState()).toMatchObject({
      currentBroadcast: null,
      segments: [],
      editorBroadcastError: '加载口播稿失败，请稍后重试',
    });
  });

  test('快速切换 ID 时较旧请求晚返回也不能覆盖当前编辑器', async () => {
    let resolveOldDetail!: (value: unknown) => void;
    const oldDetail = new Promise((resolve) => { resolveOldDetail = resolve; });
    apiMocks.getDetail
      .mockReturnValueOnce(oldDetail)
      .mockResolvedValueOnce({ data: detailPayload(makeBroadcast(62), [makeSegment(62)]) });

    const oldRequest = useStore.getState().loadEditorBroadcast(61);
    await useStore.getState().loadEditorBroadcast(62);
    resolveOldDetail({ data: detailPayload(makeBroadcast(61), [makeSegment(61)]) });
    await oldRequest;

    expect(useStore.getState().currentBroadcast?.id).toBe(62);
    expect(useStore.getState().segments[0].broadcast_id).toBe(62);
  });

  test('创建草稿后以服务端返回 ID 建立可恢复编辑器状态', async () => {
    const broadcast = makeBroadcast(71, { content: '转录导入正文', voice_type: null, voice_config: '{}' });
    apiMocks.createDraft.mockResolvedValue({
      data: { ...detailPayload(broadcast), voiceConfig: { ...voiceConfig, voice: '', voiceType: '' } },
    });

    const created = await useStore.getState().createEditorDraft({ text: '转录导入正文' });

    expect(apiMocks.createDraft).toHaveBeenCalledWith({ text: '转录导入正文' });
    expect(created.id).toBe(71);
    expect(useStore.getState()).toMatchObject({ currentBroadcast: broadcast, script: '转录导入正文' });
  });

  test('历史 Render 由后端派生新 draft，不复用原 ID', async () => {
    const draft = makeBroadcast(82, { content: '历史成稿副本' });
    apiMocks.forkDraft.mockResolvedValue({ data: detailPayload(draft) });

    const created = await useStore.getState().forkEditorDraft(41);

    expect(apiMocks.forkDraft).toHaveBeenCalledWith(41);
    expect(created.id).toBe(82);
    expect(useStore.getState().currentBroadcast?.id).toBe(82);
  });

  test('离开发起页后取消未完成草稿意图，迟到响应不会返回可导航 ID', async () => {
    const draft = makeBroadcast(83, { content: '迟到草稿' });
    let resolveDraft!: (value: unknown) => void;
    apiMocks.createDraft.mockReturnValue(new Promise((resolve) => { resolveDraft = resolve; }));

    const pending = useStore.getState().createEditorDraft({ text: '迟到草稿' });
    expect(useStore.getState().isCreatingEditorDraft).toBe(true);
    useStore.getState().cancelEditorDraftCreation();
    resolveDraft({ data: detailPayload(draft) });

    await expect(pending).rejects.toThrow('编辑器草稿请求已取消');
    expect(useStore.getState()).toMatchObject({
      currentBroadcast: null,
      isCreatingEditorDraft: false,
    });
  });

  test('后台分段在 URL 加载中完成时重读最新 Segment 快照', async () => {
    const broadcast = makeBroadcast(84, { status: 'pending' });
    const staleSegment = { ...makeSegment(84), status: 'generating' as const };
    const completedSegment = {
      ...makeSegment(84),
      status: 'generated' as const,
      audio_path: '/audio/segment-84.wav',
    };
    let resolveDetail!: (value: unknown) => void;
    apiMocks.getDetail
      .mockReturnValueOnce(new Promise((resolve) => { resolveDetail = resolve; }))
      .mockResolvedValueOnce({ data: detailPayload(broadcast, [completedSegment]) });

    const loading = useStore.getState().loadEditorBroadcast(84);
    await Promise.resolve();
    markSegmentEntityChanged(84);
    resolveDetail({ data: detailPayload(broadcast, [staleSegment]) });
    await loading;

    expect(apiMocks.getDetail).toHaveBeenCalledTimes(2);
    expect(useStore.getState().segments).toEqual([completedSegment]);
  });

  test('刷新命中在途切分时自动轮询聚合快照直到 Segments 提交', async () => {
    const draft = makeBroadcast(85, { status: 'draft' });
    const pending: Broadcast = { ...draft, status: 'pending' };
    const segment = makeSegment(85);
    apiMocks.getDetail
      .mockResolvedValueOnce({
        data: { ...detailPayload(draft), splitInProgress: true },
      })
      .mockResolvedValueOnce({
        data: detailPayload(pending, [segment]),
      });

    await useStore.getState().loadEditorBroadcast(85);

    expect(apiMocks.getDetail).toHaveBeenCalledTimes(2);
    expect(useStore.getState()).toMatchObject({
      currentBroadcast: pending,
      segments: [segment],
      isLoadingEditorBroadcast: false,
    });
  });
});
