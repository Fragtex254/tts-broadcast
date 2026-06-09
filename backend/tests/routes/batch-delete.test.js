const request = require('supertest');
const app = require('../../src/app');
const db = require('../../src/db');
const broadcastStore = require('../../src/services/broadcastStore');

describe('POST /api/broadcast/batch-delete', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM broadcasts').run();
  });

  test('应该批量删除多条记录', async () => {
    const b1 = broadcastStore.create({ title: 'Test 1', content: 'Content 1' });
    const b2 = broadcastStore.create({ title: 'Test 2', content: 'Content 2' });
    const b3 = broadcastStore.create({ title: 'Test 3', content: 'Content 3' });

    const response = await request(app)
      .post('/api/broadcast/batch-delete')
      .send({ ids: [b1.id, b3.id] })
      .expect(200);

    expect(response.body.deleted).toBe(2);
    expect(response.body.failed).toBe(0);
    expect(broadcastStore.getById(b1.id)).toBeUndefined();
    expect(broadcastStore.getById(b2.id)).toBeDefined();
    expect(broadcastStore.getById(b3.id)).toBeUndefined();
  });

  test('应该返回 400 如果 ids 为空', async () => {
    const response = await request(app)
      .post('/api/broadcast/batch-delete')
      .send({ ids: [] })
      .expect(400);

    expect(response.body.error).toBe('请提供要删除的记录 ID 列表');
  });

  test('应该返回 400 如果 ids 不是数组', async () => {
    const response = await request(app)
      .post('/api/broadcast/batch-delete')
      .send({ ids: 'not-array' })
      .expect(400);

    expect(response.body.error).toBe('请提供要删除的记录 ID 列表');
  });

  test('应该处理不存在的 ID', async () => {
    const b1 = broadcastStore.create({ title: 'Test 1', content: 'Content 1' });

    const response = await request(app)
      .post('/api/broadcast/batch-delete')
      .send({ ids: [b1.id, 99999] })
      .expect(200);

    expect(response.body.deleted).toBe(1);
    expect(response.body.failed).toBe(1);
  });
});
