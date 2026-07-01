const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

// 批量生成会调用真实 TTS 外部 API，这里 mock 掉
jest.mock('../../src/services/tts', () => ({
  generateSpeech: jest.fn(),
}));
const tts = require('../../src/services/tts');
const audio = require('../../src/services/audio');
const audioAsset = require('../../src/services/audioAsset');
const mimo = require('../../src/services/mimo');
const segmentStore = require('../../src/services/segmentStore');
const ttsQueue = require('../../src/services/ttsQueue');

describe('Segments API', () => {
  let broadcastId;

  beforeEach(() => {
    ttsQueue.clear();
    ttsQueue.minIntervalMs = 0;
    ttsQueue.maxConcurrent = 10;
    ttsQueue.lastStartAt = 0;

    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM broadcasts').run();

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
    broadcastId = result.lastInsertRowid;
  });

  afterEach(() => {
    ttsQueue.clear();
    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM broadcasts').run();
  });

  describe('GET /api/broadcast/:id/segments', () => {
    test('返回空 segments 列表', async () => {
      const res = await request(app).get(`/api/broadcast/${broadcastId}/segments`);
      expect(res.status).toBe(200);
      expect(res.body.segments).toEqual([]);
    });

    test('返回已有的 segments 列表', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '第一句', 'pending');
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 1, '第二句', 'pending');

      const res = await request(app).get(`/api/broadcast/${broadcastId}/segments`);
      expect(res.status).toBe(200);
      expect(res.body.segments.length).toBe(2);
      expect(res.body.segments[0].text).toBe('第一句');
      expect(res.body.segments[1].text).toBe('第二句');
    });

    test('不存在的 broadcast 返回 404', async () => {
      const res = await request(app).get('/api/broadcast/99999/segments');
      expect(res.status).toBe(404);
    });

    test('无效 ID 返回 400', async () => {
      const res = await request(app).get('/api/broadcast/abc/segments');
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/broadcast/:id/segments/reorder', () => {
    test('成功重排序', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '第一句', 'pending');
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 1, '第二句', 'pending');

      const segments = db.prepare('SELECT id FROM segments WHERE broadcast_id = ? ORDER BY "index"')
        .all(broadcastId);

      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/reorder`)
        .send({ segmentIds: [segments[1].id, segments[0].id] });

      expect(res.status).toBe(200);
      expect(res.body.segments[0].text).toBe('第二句');
      expect(res.body.segments[1].text).toBe('第一句');
    });

    test('缺少 segmentIds 返回 400', async () => {
      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/reorder`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('不存在的 broadcast 或 segments 返回 400', async () => {
      const res = await request(app)
        .post('/api/broadcast/99999/segments/reorder')
        .send({ segmentIds: [1] });
      expect(res.status).toBe(400);
    });

    test('无效 ID 返回 400', async () => {
      const res = await request(app)
        .post('/api/broadcast/abc/segments/reorder')
        .send({ segmentIds: [1] });
      expect(res.status).toBe(400);
    });
  });

  describe('batch-generate 注入风格标签', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      tts.generateSpeech.mockReset();
    });

    test('生成时把 (风格) 前置到合成文本', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, style_tag) VALUES (?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, '第一句', 'pending', '平静');
      tts.generateSpeech.mockResolvedValue(Buffer.from('wav'));
      jest.spyOn(audioAsset, 'writeSegmentAudio').mockReturnValue('/audio/seg_0.wav');

      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/batch-generate`)
        .send();

      expect(res.status).toBe(200);
      expect(tts.generateSpeech).toHaveBeenCalledWith(
        expect.objectContaining({ text: '(平静)第一句' })
      );
    }, 15000);

    test('无 style_tag 时文本原样传入', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, style_tag) VALUES (?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, '第二句', 'pending', '');
      tts.generateSpeech.mockResolvedValue(Buffer.from('wav'));
      jest.spyOn(audioAsset, 'writeSegmentAudio').mockReturnValue('/audio/seg_0.wav');

      await request(app).post(`/api/broadcast/${broadcastId}/segments/batch-generate`).send();

      expect(tts.generateSpeech).toHaveBeenCalledWith(
        expect.objectContaining({ text: '第二句' })
      );
    }, 15000);
  });

  describe('POST /api/broadcast/:id/segments/replace', () => {
    test('合并/拆分后批量替换并重置受影响段状态', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, audio_path, style_tag) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, '第一句。', 'generated', '/audio/old_0.wav', '平静');
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, audio_path, style_tag) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(broadcastId, 1, '第二句。', 'generated', '/audio/old_1.wav', '平静');
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, audio_path, style_tag) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(broadcastId, 2, '第三句。', 'generated', '/audio/old_2.wav', '严肃');
      const old = segmentStore.getByBroadcastId(broadcastId);

      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/replace`)
        .send({
          segments: [
            { id: old[0].id, text: '第一句。第二句。', styleTag: '平静转入铺垫' },
            { id: old[2].id, text: '第三句。', styleTag: '严肃' },
            { text: '新增补充段。', styleTag: '温柔' },
          ],
        });

      expect(res.status).toBe(200);
      expect(res.body.segments.map((s) => s.text)).toEqual(['第一句。第二句。', '第三句。', '新增补充段。']);
      expect(res.body.segments[0].status).toBe('pending');
      expect(res.body.segments[0].audio_path).toBeNull();
      expect(res.body.segments[1].status).toBe('generated');
      expect(res.body.segments[1].audio_path).toBe('/audio/old_2.wav');
      expect(res.body.segments[2].status).toBe('pending');
      expect(res.body.segments[0].style_tag).toBe('平静转入铺垫');
      expect(res.body.segments.map((s) => s.index)).toEqual([0, 1, 2]);
    });

    test('单段超过 1024 字返回 400', async () => {
      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/replace`)
        .send({ segments: [{ text: '一'.repeat(1025), styleTag: '' }] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('1024');
    });

    test('引用不属于当前播报的 segment 返回 400', async () => {
      const otherBroadcast = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run('其他', '内容', 'preset', '{"voice":"冰糖"}', 'pending', 'segmented');
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(otherBroadcast.lastInsertRowid, 0, '其他句子', 'pending');
      const otherSegment = segmentStore.getByBroadcastId(otherBroadcast.lastInsertRowid)[0];

      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/replace`)
        .send({ segments: [{ id: otherSegment.id, text: '非法引用', styleTag: '' }] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('不属于当前播报');
    });
  });

  describe('POST /api/broadcast/:id/segments/merge', () => {
    test('无 segments 时返回 400', async () => {
      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/merge`)
        .send();
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('没有可合并');
    });

    test('存在未生成音频的 segments 时返回 400', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '第一句', 'pending');

      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/merge`)
        .send();
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('未生成');
    });

    test('不存在的 broadcast 返回 404', async () => {
      const res = await request(app)
        .post('/api/broadcast/99999/segments/merge')
        .send();
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /api/broadcast/:id/segments/:segId', () => {
    test('成功编辑文本', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '旧文本', 'pending');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/${seg.id}`)
        .send({ text: '新文本' });

      expect(res.status).toBe(200);
      expect(res.body.segment.text).toBe('新文本');
      expect(res.body.segment.status).toBe('pending');
    });

    test('空文本返回 400', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '文本', 'pending');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/${seg.id}`)
        .send({ text: '' });
      expect(res.status).toBe(400);
    });

    test('同时传 text 与 styleTag 时两者都生效（含清洗）', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, audio_path) VALUES (?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, '旧文本', 'generated', '/audio/x.wav');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/${seg.id}`)
        .send({ text: '新文本', styleTag: '（严肃）' });

      expect(res.status).toBe(200);
      expect(res.body.segment.text).toBe('新文本');
      expect(res.body.segment.style_tag).toBe('严肃');
      expect(res.body.segment.status).toBe('pending');
      expect(res.body.segment.audio_path).toBeNull();
    });

    test('不存在的 segment 返回 404', async () => {
      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/99999`)
        .send({ text: '新文本' });
      expect(res.status).toBe(404);
    });

    test('编辑后状态重置为 pending', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, audio_path) VALUES (?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, '旧文本', 'generated', '/audio/test.wav');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/${seg.id}`)
        .send({ text: '更新文本' });

      expect(res.status).toBe(200);
      expect(res.body.segment.status).toBe('pending');
    });

    test('设置 styleTag 并重置为 pending（含清洗括号）', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, audio_path) VALUES (?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, '文本', 'generated', '/audio/x.wav');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/${seg.id}`)
        .send({ styleTag: '(平静)' });

      expect(res.status).toBe(200);
      expect(res.body.segment.style_tag).toBe('平静');
      expect(res.body.segment.status).toBe('pending');
    });

    test('设置 styleTag 不带括号时原样入库', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '文本', 'pending');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/${seg.id}`)
        .send({ styleTag: '活泼' });

      expect(res.status).toBe(200);
      expect(res.body.segment.style_tag).toBe('活泼');
    });

    test('suggest-tags 写回时对 AI 返回值做 sanitize 兜底', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, 'A', 'pending');
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 1, 'B', 'pending');
      // AI 偶发返回带括号值：sanitize 兜底剥括号
      jest.spyOn(mimo, 'suggestStyleTags').mockResolvedValue(['(平静)', '严肃']);

      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/suggest-tags`)
        .send({ allowedTags: ['平静', '严肃'] });

      expect(res.status).toBe(200);
      expect(res.body.segments.map((s) => s.style_tag)).toEqual(['平静', '严肃']);
    });

    test('text 与 styleTag 都不传返回 400', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '文本', 'pending');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .put(`/api/broadcast/${broadcastId}/segments/${seg.id}`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/broadcast/:id/segments/:segId', () => {
    test('成功删除 segment', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '待删除', 'pending');
      const seg = db.prepare('SELECT id FROM segments WHERE broadcast_id = ?').get(broadcastId);

      const res = await request(app)
        .delete(`/api/broadcast/${broadcastId}/segments/${seg.id}`);

      expect(res.status).toBe(200);
      expect(res.body.segments.length).toBe(0);
    });

    test('删除后重索引', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '第一句', 'pending');
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 1, '第二句', 'pending');
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 2, '第三句', 'pending');

      const segments = db.prepare('SELECT id FROM segments WHERE broadcast_id = ? ORDER BY "index"')
        .all(broadcastId);

      // 删除第一句
      await request(app)
        .delete(`/api/broadcast/${broadcastId}/segments/${segments[0].id}`);

      // 获取剩余 segments，验证重索引
      const res = await request(app).get(`/api/broadcast/${broadcastId}/segments`);
      expect(res.body.segments.length).toBe(2);
      expect(res.body.segments[0].index).toBe(0);
      expect(res.body.segments[0].text).toBe('第二句');
      expect(res.body.segments[1].index).toBe(1);
      expect(res.body.segments[1].text).toBe('第三句');
    });

    test('不存在的 segment 返回 404', async () => {
      const res = await request(app)
        .delete(`/api/broadcast/${broadcastId}/segments/99999`);
      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/broadcast/:id/segments/suggest-tags', () => {
    afterEach(() => jest.restoreAllMocks());

    test('写回 AI 建议的风格标签', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, 'A', 'pending');
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 1, 'B', 'pending');
      jest.spyOn(mimo, 'suggestStyleTags').mockResolvedValue(['平静', '严肃']);

      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/suggest-tags`)
        .send({ allowedTags: ['平静', '严肃'] });

      expect(res.status).toBe(200);
      expect(res.body.segments.map((s) => s.style_tag)).toEqual(['平静', '严肃']);
    });

    test('缺少 allowedTags 返回 400', async () => {
      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/suggest-tags`)
        .send({});
      expect(res.status).toBe(400);
    });

    test('不存在的 broadcast 返回 404', async () => {
      const res = await request(app)
        .post('/api/broadcast/99999/segments/suggest-tags')
        .send({ allowedTags: ['平静'] });
      expect(res.status).toBe(404);
    });

    test('AI 调用抛错时不写库（事务回滚：style_tag 保持原值）', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status, style_tag) VALUES (?, ?, ?, ?, ?)`)
        .run(broadcastId, 0, 'A', 'pending', '原值');
      jest.spyOn(mimo, 'suggestStyleTags').mockRejectedValue(new Error('LLM 超时'));

      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/suggest-tags`)
        .send({ allowedTags: ['平静', '严肃'] });

      expect(res.status).toBe(500);
      const after = segmentStore.getByBroadcastId(broadcastId);
      expect(after[0].style_tag).toBe('原值');
    });
  });

  describe('POST /api/broadcast/:id/segments/batch-generate', () => {
    let cloneBroadcastId;

    beforeEach(() => {
      db.prepare('DELETE FROM segments').run();
      db.prepare('DELETE FROM broadcasts').run();

      // 使用 clone 音色 + /audio 路径，触发批量开始阶段的一次性解析逻辑
      const result = db.prepare(`
        INSERT INTO broadcasts (title, content, voice_type, voice_config, status, mode)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        '克隆批量生成',
        '内容',
        'clone',
        JSON.stringify({ voiceClone: '/audio/preset_original_1.wav' }),
        'pending',
        'segmented'
      );
      cloneBroadcastId = result.lastInsertRowid;

      const insert = db.prepare('INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)');
      insert.run(cloneBroadcastId, 0, '第一句', 'pending');
      insert.run(cloneBroadcastId, 1, '第二句', 'pending');
      insert.run(cloneBroadcastId, 2, '第三句', 'pending');

      tts.generateSpeech.mockResolvedValue(Buffer.from('fake-wav'));
      jest.spyOn(audio, 'resolveVoiceClone').mockResolvedValue('data:audio/wav;base64,AAAA');
      jest.spyOn(audioAsset, 'writeSegmentAudio').mockReturnValue('/audio/segment_fake.wav');
    });

    afterEach(() => {
      jest.restoreAllMocks();
      tts.generateSpeech.mockReset();
    });

    test('clone 音色只解析一次（不在每段重复读取文件 / base64）', async () => {
      const res = await request(app)
        .post(`/api/broadcast/${cloneBroadcastId}/segments/batch-generate`)
        .send();

      expect(res.status).toBe(200);
      // 3 段只解析 1 次 clone 音色
      expect(audio.resolveVoiceClone).toHaveBeenCalledTimes(1);
      // 仍逐段调用 TTS（保持限速串行）
      expect(tts.generateSpeech).toHaveBeenCalledTimes(3);
      expect(res.body.segments.every((s) => s.status === 'generated')).toBe(true);
    }, 15000);

    test('clone 音色解析失败时各段落到可重试的 failed 状态而非中断整批', async () => {
      audio.resolveVoiceClone.mockRejectedValue(new Error('voiceClone 格式无效'));

      const res = await request(app)
        .post(`/api/broadcast/${cloneBroadcastId}/segments/batch-generate`)
        .send();

      expect(res.status).toBe(200);
      // 解析只尝试一次，失败后不再逐段重复尝试
      expect(audio.resolveVoiceClone).toHaveBeenCalledTimes(1);
      // 解析失败则不应调用 TTS
      expect(tts.generateSpeech).not.toHaveBeenCalled();
      expect(res.body.segments.every((s) => s.status === 'failed')).toBe(true);
      expect(res.body.segments.every((s) => s.error_message.includes('voiceClone 格式无效'))).toBe(true);
    }, 15000);

    test('单段 TTS 失败时返回具体错误原因', async () => {
      tts.generateSpeech.mockRejectedValue(new Error('MiMo API 请求过于频繁，请稍后再试'));

      const res = await request(app)
        .post(`/api/broadcast/${cloneBroadcastId}/segments/batch-generate`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.results[0].error).toContain('MiMo API 请求过于频繁');
      expect(res.body.segments[0].error_message).toContain('MiMo API 请求过于频繁');
    }, 15000);
  });

  describe('POST /api/broadcast/:id/segments/:segId/regenerate', () => {
    afterEach(() => {
      jest.restoreAllMocks();
      tts.generateSpeech.mockReset();
    });

    test('重新生成单句也经过 TTS 全局队列', async () => {
      db.prepare(`INSERT INTO segments (broadcast_id, "index", text, status) VALUES (?, ?, ?, ?)`)
        .run(broadcastId, 0, '需要重生成的句子', 'failed');
      const segment = segmentStore.getByBroadcastId(broadcastId)[0];
      const enqueueSpy = jest.spyOn(ttsQueue, 'enqueue');

      tts.generateSpeech.mockResolvedValue(Buffer.from('fake-wav'));
      jest.spyOn(audioAsset, 'writeSegmentAudio').mockReturnValue('/audio/segment_regenerated.wav');

      const res = await request(app)
        .post(`/api/broadcast/${broadcastId}/segments/${segment.id}/regenerate`)
        .send();

      expect(res.status).toBe(200);
      expect(enqueueSpy).toHaveBeenCalledTimes(1);
      expect(tts.generateSpeech).toHaveBeenCalledWith(
        expect.objectContaining({ text: '需要重生成的句子' })
      );
      expect(res.body.segment.status).toBe('generated');
    });
  });
});
