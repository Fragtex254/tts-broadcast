const db = require('../../src/db');
const broadcastStore = require('../../src/services/broadcastStore');

describe('segments.style_tag 列', () => {
  test('新插入的 segment style_tag 默认空串', () => {
    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM broadcasts').run();
    const b = broadcastStore.create({
      title: 't', content: 'c', voiceType: 'preset',
      voiceConfig: '{}', status: 'pending', mode: 'segmented',
    });
    db.prepare('INSERT INTO segments (broadcast_id, "index", text) VALUES (?, ?, ?)')
      .run(b.id, 0, '句子');
    const seg = db.prepare('SELECT style_tag FROM segments WHERE broadcast_id = ?').get(b.id);
    expect(seg.style_tag).toBe('');
  });
});
