const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');

describe('Segments API', () => {
  let broadcastId;

  beforeEach(() => {
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
});
