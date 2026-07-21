const fs = require('fs');
const path = require('path');
const db = require('../../src/db');
const audioAsset = require('../../src/services/audioAsset');
const broadcastRenderService = require('../../src/services/broadcastRenderService');
const broadcastStore = require('../../src/services/broadcastStore');
const ttsQueue = require('../../src/services/ttsQueue');
const { audioDir } = require('../../src/utils/validation');

const originalWriteBroadcastAudio = audioAsset.writeBroadcastAudio;
const originalCompleteWholeGeneration = broadcastStore.completeWholeGeneration;

describe('整篇音频 Render 服务', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    db.prepare('DELETE FROM broadcasts').run();
    db.prepare('DELETE FROM content_projects').run();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    db.prepare('DELETE FROM broadcasts').run();
    db.prepare('DELETE FROM content_projects').run();
  });

  function createSourceRevision(content) {
    const project = db.prepare('INSERT INTO content_projects (title) VALUES (?)').run('Render 服务项目');
    const artifact = db.prepare(`
      INSERT INTO content_artifacts (project_id, kind, title)
      VALUES (?, 'audio_script', ?)
    `).run(project.lastInsertRowid, '口播稿');
    const revision = db.prepare(`
      INSERT INTO content_artifact_revisions (artifact_id, revision_number, content)
      VALUES (?, 1, ?)
    `).run(artifact.lastInsertRowid, content);
    return {
      projectId: Number(project.lastInsertRowid),
      revisionId: Number(revision.lastInsertRowid),
    };
  }

  function generate(params = {}) {
    return broadcastRenderService.generateWholeRender({
      speechParams: { text: '服务测试口播稿', voice: '冰糖' },
      title: '服务测试口播稿...',
      content: '服务测试口播稿',
      voiceType: 'preset',
      voiceConfig: { voice: '冰糖' },
      sourceItems: null,
      sourceArtifactRevisionId: null,
      ...params,
    });
  }

  test('TTS 等待期间删除来源项目时保留并完成已创建 Render', async () => {
    const source = createSourceRevision('服务测试口播稿');
    jest.spyOn(ttsQueue, 'enqueueTts').mockImplementation(async () => {
      expect(db.prepare('SELECT status FROM broadcasts').get()).toEqual({ status: 'pending' });
      db.prepare('DELETE FROM content_projects WHERE id = ?').run(source.projectId);
      return Buffer.from('generated-wav');
    });
    jest.spyOn(audioAsset, 'writeBroadcastAudio').mockReturnValue('/audio/service-race.wav');

    const result = await generate({ sourceArtifactRevisionId: source.revisionId });

    expect(result.broadcast).toMatchObject({
      status: 'generated',
      artifact_revision_id: null,
      source_artifact_revision_id: null,
      audio_path: '/audio/service-race.wav',
    });
  });

  test('TTS provider 失败时透传原错误并回滚 pending Render', async () => {
    jest.spyOn(ttsQueue, 'enqueueTts').mockRejectedValue(new Error('MiMo TTS 暂时不可用，请稍后重试'));

    await expect(generate()).rejects.toThrow('MiMo TTS 暂时不可用，请稍后重试');
    expect(db.prepare('SELECT COUNT(*) AS count FROM broadcasts').get().count).toBe(0);
  });

  test('补偿删除音频失败时仍回滚 pending Render并保留稳定落库错误', async () => {
    jest.spyOn(ttsQueue, 'enqueueTts').mockResolvedValue(Buffer.from('cleanup-failure-wav'));
    let writtenAudioPath;
    jest.spyOn(audioAsset, 'writeBroadcastAudio').mockImplementation((buffer, broadcastId) => {
      writtenAudioPath = originalWriteBroadcastAudio(buffer, `service_cleanup_${broadcastId}`);
      return writtenAudioPath;
    });
    jest.spyOn(broadcastStore, 'completeWholeGeneration').mockImplementation(() => {
      throw new Error('模拟数据库收口失败');
    });
    jest.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
      throw new Error('模拟音频补偿删除失败');
    });

    await expect(generate()).rejects.toMatchObject({
      code: broadcastRenderService.RENDER_PERSISTENCE_FAILED,
      message: '音频生成结果保存失败，请重试',
    });
    expect(db.prepare('SELECT COUNT(*) AS count FROM broadcasts').get().count).toBe(0);

    const absoluteAudioPath = path.join(audioDir, writtenAudioPath.slice('/audio/'.length));
    if (fs.existsSync(absoluteAudioPath)) fs.unlinkSync(absoluteAudioPath);
  });

  test('收口 UPDATE 已成功但 DTO 对账异常时不删除已生成音频', async () => {
    jest.spyOn(ttsQueue, 'enqueueTts').mockResolvedValue(Buffer.from('settled-wav'));
    let writtenAudioPath;
    jest.spyOn(audioAsset, 'writeBroadcastAudio').mockImplementation((buffer, broadcastId) => {
      writtenAudioPath = originalWriteBroadcastAudio(buffer, `service_settled_${broadcastId}`);
      return writtenAudioPath;
    });
    jest.spyOn(broadcastStore, 'completeWholeGeneration').mockImplementation((params) => {
      originalCompleteWholeGeneration(params);
      throw new Error('模拟 UPDATE 后 DTO 读取失败');
    });
    jest.spyOn(broadcastStore, 'getById').mockImplementation(() => {
      throw new Error('模拟对账读取失败');
    });

    await expect(generate()).rejects.toMatchObject({
      code: broadcastRenderService.RENDER_PERSISTENCE_FAILED,
      message: '音频生成结果保存失败，请重试',
    });

    const settled = db.prepare('SELECT status, audio_path FROM broadcasts').get();
    expect(settled).toEqual({ status: 'generated', audio_path: writtenAudioPath });
    const absoluteAudioPath = path.join(audioDir, writtenAudioPath.slice('/audio/'.length));
    expect(fs.existsSync(absoluteAudioPath)).toBe(true);
    fs.unlinkSync(absoluteAudioPath);
  });
});
