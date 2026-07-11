jest.mock('../../src/services/aihot', () => ({
  getSelectedItems: jest.fn()
}));

const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const aihot = require('../../src/services/aihot');
const audio = require('../../src/services/audio');

describe('播报 API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('GET /api/broadcast/today - 获取今日资讯（归一化驼峰字段为蛇形）', async () => {
    const items = [
      { title: 'AI 新闻', url: 'https://example.com/news', publishedAt: '2026-06-13T00:00:00.000Z' }
    ];
    aihot.getSelectedItems.mockResolvedValue(items);

    const res = await request(app).get('/api/broadcast/today?category=ai-models&take=5');

    expect(res.status).toBe(200);
    // 路由层将 AI HOT 的驼峰字段映射为前端约定的蛇形字段，同时保留原始字段
    expect(res.body.items).toEqual([
      {
        title: 'AI 新闻',
        url: 'https://example.com/news',
        publishedAt: '2026-06-13T00:00:00.000Z',
        source_url: 'https://example.com/news',
        published_at: '2026-06-13T00:00:00.000Z'
      }
    ]);
    expect(aihot.getSelectedItems).toHaveBeenCalledWith({
      category: 'ai-models',
      since: expect.any(String),
      take: 5
    });
  });

  test('GET /api/broadcast/today - 原始数据缺少 url/publishedAt 时归一化为空字符串', async () => {
    aihot.getSelectedItems.mockResolvedValue([{ title: '无链接资讯' }]);

    const res = await request(app).get('/api/broadcast/today');

    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      title: '无链接资讯',
      source_url: '',
      published_at: ''
    });
  });

  test('GET /api/broadcast/history - 只返回已保存记录', async () => {
    db.prepare('DELETE FROM broadcasts').run();
    db.prepare(`
      INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode, saved)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('未保存稿件', '未保存内容', 'preset', '{}', 'generated', 'whole', 0);
    db.prepare(`
      INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode, saved)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('已保存稿件', '已保存内容', 'preset', '{}', 'generated', 'whole', 1);

    const res = await request(app).get('/api/broadcast/history');
    expect(res.status).toBe(200);
    expect(res.body.broadcasts).toHaveLength(1);
    expect(res.body.broadcasts[0].title).toBe('已保存稿件');
    expect(res.body.broadcasts[0].saved).toBe(1);
    expect(res.body.pagination.total).toBe(1);
  });

  test('GET /api/broadcast/:id - 获取播报详情（不存在）', async () => {
    const res = await request(app).get('/api/broadcast/999');
    expect(res.status).toBe(404);
  });

  test('POST /api/broadcast/rewrite - 缺少参数返回 400', async () => {
    const res = await request(app)
      .post('/api/broadcast/rewrite')
      .send({});
    expect(res.status).toBe(400);
  });

  test('POST /api/broadcast/generate - 缺少参数返回 400', async () => {
    const res = await request(app)
      .post('/api/broadcast/generate')
      .send({});
    expect(res.status).toBe(400);
  });

  // ============ Segment API Tests ============

  let segmentedBroadcastId;

  test('POST /api/broadcast/generate (segmented) - 创建 segmented 广播', async () => {
    const result = db.prepare(`
      INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      '测试切分稿件',
      '大家好，欢迎收听今日AI简讯。今天我们聊聊AI最新动态。以上就是今天的内容，感谢收听。',
      'preset',
      '{"voice":"冰糖"}',
      'pending',
      'segmented'
    );
    segmentedBroadcastId = result.lastInsertRowid;
    expect(segmentedBroadcastId).toBeGreaterThan(0);
  });

  test('GET /api/broadcast/:id/segments - 获取空 segments 列表', async () => {
    const res = await request(app).get(`/api/broadcast/${segmentedBroadcastId}/segments`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('segments');
    expect(Array.isArray(res.body.segments)).toBe(true);
  });

  test('POST /api/broadcast/:id/segments/reorder - 重排序 segments', async () => {
    db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
      .run(segmentedBroadcastId, 0, '第一句', 'pending');
    db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
      .run(segmentedBroadcastId, 1, '第二句', 'pending');

    const segments = db.prepare('SELECT id FROM segments WHERE broadcast_id = ? ORDER BY "index"')
      .all(segmentedBroadcastId);

    const res = await request(app)
      .post(`/api/broadcast/${segmentedBroadcastId}/segments/reorder`)
      .send({ segmentIds: [segments[1].id, segments[0].id] });

    expect(res.status).toBe(200);
    expect(res.body.segments[0].text).toBe('第二句');
    expect(res.body.segments[1].text).toBe('第一句');

    db.prepare('DELETE FROM segments WHERE broadcast_id = ?').run(segmentedBroadcastId);
  });

  test('POST /api/broadcast/:id/segments/merge - 无 segments 返回 400', async () => {
    const res = await request(app)
      .post(`/api/broadcast/${segmentedBroadcastId}/segments/merge`)
      .send();
    expect(res.status).toBe(400);
  });

  test('GET /api/broadcast/:id/segments - 不存在的广播返回 404', async () => {
    const res = await request(app).get('/api/broadcast/99999/segments');
    expect(res.status).toBe(404);
  });

  // ============ 扩充测试 ============

  describe('POST /api/broadcast/rewrite', () => {
    test('缺少 items 参数返回 400', async () => {
      const res = await request(app)
        .post('/api/broadcast/rewrite')
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/broadcast/generate (segmented)', () => {
    test('未选择音色时返回 400', async () => {
      const res = await request(app)
        .post('/api/broadcast/generate')
        .send({
          text: '测试口播稿内容，足够长以生成标题。',
          mode: 'segmented'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('请先选择音色');
    });

    test('preset 类型缺少具体音色时返回 400', async () => {
      const res = await request(app)
        .post('/api/broadcast/generate')
        .send({
          text: '测试口播稿内容，足够长以生成标题。',
          voiceType: 'preset',
          mode: 'segmented'
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('请先选择音色');
    });

    test('segmented 模式创建播报记录', async () => {
      const res = await request(app)
        .post('/api/broadcast/generate')
        .send({
          text: '测试口播稿内容，足够长以生成标题。',
          voiceType: 'preset',
          voice: '冰糖',
          mode: 'segmented'
        });
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('broadcast');
      expect(res.body.broadcast.mode).toBe('segmented');
      expect(res.body.broadcast.status).toBe('pending');
    });
  });

  describe('POST /api/broadcast/:id/save', () => {
    let saveTestBroadcastId;

    beforeEach(() => {
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode, saved)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `).run('保存测试', '内容', 'preset', '{}', 'generated', 'whole');
      saveTestBroadcastId = result.lastInsertRowid;
    });

    test('保存播报', async () => {
      const res = await request(app)
        .post(`/api/broadcast/${saveTestBroadcastId}/save`);
      expect(res.status).toBe(200);
      expect(res.body.broadcast.saved).toBe(1);
    });

    test('取消保存播报', async () => {
      await request(app).post(`/api/broadcast/${saveTestBroadcastId}/save`);
      const res = await request(app)
        .post(`/api/broadcast/${saveTestBroadcastId}/save`);
      expect(res.status).toBe(200);
      expect(res.body.broadcast.saved).toBe(0);
    });

    test('不存在的播报返回 404', async () => {
      const res = await request(app).post('/api/broadcast/99999/save');
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/broadcast/:id/voice-config', () => {
    let vcTestBroadcastId;

    beforeEach(() => {
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('音色测试', '内容', 'preset', '{"voice":"冰糖"}', 'pending', 'whole');
      vcTestBroadcastId = result.lastInsertRowid;
    });

    test('更新音色配置', async () => {
      const res = await request(app)
        .patch(`/api/broadcast/${vcTestBroadcastId}/voice-config`)
        .send({ voiceType: 'design', voiceDesign: '温柔女声' });
      expect(res.status).toBe(200);
      expect(res.body.broadcast.voice_type).toBe('design');
    });

    test('未选择音色时拒绝更新配置', async () => {
      const res = await request(app)
        .patch(`/api/broadcast/${vcTestBroadcastId}/voice-config`)
        .send({ voiceType: 'preset' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('请先选择音色');
    });

    test('design 音色配置保存 optimizeTextPreview 开关', async () => {
      const res = await request(app)
        .patch(`/api/broadcast/${vcTestBroadcastId}/voice-config`)
        .send({
          voiceType: 'design',
          voiceDesign: '温柔女声',
          optimizeTextPreview: true
        });

      expect(res.status).toBe(200);
      const config = JSON.parse(res.body.broadcast.voice_config);
      expect(config.optimizeTextPreview).toBe(true);
    });

    test('忽略旧表演导演配置', async () => {
      const res = await request(app)
        .patch(`/api/broadcast/${vcTestBroadcastId}/voice-config`)
        .send({
          voiceType: 'design',
          voiceDesign: '温柔女声',
          performance: {
            role: '克制的女性角色',
            scene: '深夜独白',
            direction: '语速偏慢，尾音轻收',
            globalTags: ['冷静', '气声'],
          },
        });

      expect(res.status).toBe(200);
      const config = JSON.parse(res.body.broadcast.voice_config);
      expect(config.performance).toBeUndefined();
    });

    test('支持较大的克隆音频配置', async () => {
      const res = await request(app)
        .patch(`/api/broadcast/${vcTestBroadcastId}/voice-config`)
        .send({
          voiceType: 'clone',
          voiceClone: 'a'.repeat(200 * 1024)
        });
      expect(res.status).toBe(200);
      expect(res.body.broadcast.voice_type).toBe('clone');
    });
  });

  describe('GET /api/broadcast/:id/audio', () => {
    test('无音频时返回 404', async () => {
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('无音频', '内容', 'preset', '{}', 'pending', 'whole');
      const res = await request(app).get(`/api/broadcast/${result.lastInsertRowid}/audio`);
      expect(res.status).toBe(404);
    });

    test('分段播报预览时临时生成变速合并音频且不落盘', async () => {
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('预览测试', '内容', 'preset', '{}', 'generated', 'segmented');
      const broadcastId = result.lastInsertRowid;
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, audio_path, playback_rate) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, '第一句', 'generated', '/audio/a.wav', 1.5);
      jest.spyOn(audio, 'mergeSegmentAudioWithRates').mockResolvedValue(Buffer.from('preview-wav'));

      const res = await request(app).get(`/api/broadcast/${broadcastId}/audio`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('audio/wav');
      expect(res.text || res.body.toString()).toContain('preview-wav');
      const broadcast = db.prepare('SELECT audio_path FROM broadcasts WHERE id = ?').get(broadcastId);
      expect(broadcast.audio_path).toBeNull();
    });

    test('分段合并音频支持 Range 响应以便拖动播放进度', async () => {
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('进度拖动测试', '内容', 'preset', '{}', 'generated', 'segmented');
      const broadcastId = result.lastInsertRowid;
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, audio_path, playback_rate) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, '第一句', 'generated', '/audio/a.wav', 1);
      jest.spyOn(audio, 'mergeSegmentAudioWithRates').mockResolvedValue(Buffer.from('preview-wav'));

      const res = await request(app)
        .get(`/api/broadcast/${broadcastId}/audio`)
        .set('Range', 'bytes=2-5');

      expect(res.status).toBe(206);
      expect(res.headers['accept-ranges']).toBe('bytes');
      expect(res.headers['content-range']).toBe('bytes 2-5/11');
      expect(res.headers['content-length']).toBe('4');
      expect(res.body).toEqual(Buffer.from('evie'));
    });
  });

  describe('GET /api/broadcast/:id/download', () => {
    test('分段播报下载时按 playback_rate 实时生成变速合并音频', async () => {
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('下载测试', '内容', 'preset', '{}', 'generated', 'segmented');
      const broadcastId = result.lastInsertRowid;
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, audio_path, playback_rate) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, '第一句', 'generated', '/audio/a.wav', 1.25);

      jest.spyOn(audio, 'mergeSegmentAudioWithRates').mockResolvedValue(Buffer.from('download-wav'));

      const res = await request(app).get(`/api/broadcast/${broadcastId}/download`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('audio/wav');
      expect(audio.mergeSegmentAudioWithRates).toHaveBeenCalledWith([
        expect.objectContaining({ playback_rate: 1.25 }),
      ]);
    });
  });
});
