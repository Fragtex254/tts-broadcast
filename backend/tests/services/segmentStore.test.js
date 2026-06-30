const segmentStore = require('../../src/services/segmentStore');
const broadcastStore = require('../../src/services/broadcastStore');
const db = require('../../src/db');

describe('segmentStore', () => {
  let broadcastId;

  beforeEach(() => {
    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM broadcasts').run();
    const broadcast = broadcastStore.create({
      title: '测试播报',
      content: '测试内容',
      voiceType: 'preset',
      voiceConfig: '{"voice":"冰糖"}',
      status: 'pending',
      mode: 'segmented'
    });
    broadcastId = broadcast.id;
  });

  describe('createMany', () => {
    test('批量插入 segments', () => {
      segmentStore.createMany(broadcastId, ['第一句', '第二句', '第三句']);
      const segments = segmentStore.getByBroadcastId(broadcastId);
      expect(segments.length).toBe(3);
      expect(segments[0].text).toBe('第一句');
      expect(segments[0].index).toBe(0);
      expect(segments[2].text).toBe('第三句');
      expect(segments[2].index).toBe(2);
    });

    test('所有插入的 segment 状态为 pending', () => {
      segmentStore.createMany(broadcastId, ['一句']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      expect(segs[0].status).toBe('pending');
    });
  });

  describe('getByBroadcastId', () => {
    test('按 index 排序返回', () => {
      segmentStore.createMany(broadcastId, ['B', 'A', 'C']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      expect(segs.map(s => s.text)).toEqual(['B', 'A', 'C']);
    });

    test('无 segments 时返回空数组', () => {
      expect(segmentStore.getByBroadcastId(broadcastId)).toEqual([]);
    });
  });

  describe('getByIdAndBroadcastId', () => {
    test('返回匹配的 segment', () => {
      segmentStore.createMany(broadcastId, ['测试句']);
      const all = segmentStore.getByBroadcastId(broadcastId);
      const found = segmentStore.getByIdAndBroadcastId(all[0].id, broadcastId);
      expect(found.text).toBe('测试句');
    });

    test('不匹配时返回 undefined', () => {
      expect(segmentStore.getByIdAndBroadcastId(99999, broadcastId)).toBeUndefined();
    });
  });

  describe('getPendingByBroadcastId', () => {
    test('返回 pending、failed 和遗留 generating 状态', () => {
      segmentStore.createMany(broadcastId, ['A', 'B', 'C', 'D']);
      const all = segmentStore.getByBroadcastId(broadcastId);
      segmentStore.updateStatus(all[0].id, 'generated', '/audio/test.wav');
      segmentStore.updateStatus(all[1].id, 'generating');
      segmentStore.updateStatus(all[2].id, 'failed');
      const pending = segmentStore.getPendingByBroadcastId(broadcastId);
      expect(pending.map((s) => s.status)).toEqual(['generating', 'failed', 'pending']);
    });
  });

  describe('updateStatus', () => {
    test('更新状态和音频路径', () => {
      segmentStore.createMany(broadcastId, ['测试']);
      const seg = segmentStore.getByBroadcastId(broadcastId)[0];
      segmentStore.updateStatus(seg.id, 'generated', '/audio/seg_0.wav');
      const updated = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(updated.status).toBe('generated');
      expect(updated.audio_path).toBe('/audio/seg_0.wav');
    });

    test('不传 audioPath 时只更新状态', () => {
      segmentStore.createMany(broadcastId, ['测试']);
      const seg = segmentStore.getByBroadcastId(broadcastId)[0];
      segmentStore.updateStatus(seg.id, 'failed');
      const updated = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(updated.status).toBe('failed');
    });
  });

  describe('updateText', () => {
    test('更新文本并重置状态为 pending', () => {
      segmentStore.createMany(broadcastId, ['旧文本']);
      const seg = segmentStore.getByBroadcastId(broadcastId)[0];
      segmentStore.updateStatus(seg.id, 'generated', '/audio/seg.wav');
      segmentStore.updateText(seg.id, '新文本');
      const updated = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(updated.text).toBe('新文本');
      expect(updated.status).toBe('pending');
      expect(updated.audio_path).toBeNull();
    });
  });

  describe('reorder', () => {
    test('按新 ID 顺序重排 index', () => {
      segmentStore.createMany(broadcastId, ['A', 'B', 'C']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      segmentStore.reorder(broadcastId, [segs[2].id, segs[0].id, segs[1].id]);
      const reordered = segmentStore.getByBroadcastId(broadcastId);
      expect(reordered.map(s => s.text)).toEqual(['C', 'A', 'B']);
    });
  });

  describe('deleteById', () => {
    test('删除单条 segment', () => {
      segmentStore.createMany(broadcastId, ['A', 'B']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      segmentStore.deleteById(segs[0].id);
      const remaining = segmentStore.getByBroadcastId(broadcastId);
      expect(remaining.length).toBe(1);
      expect(remaining[0].text).toBe('B');
    });
  });

  describe('deleteByBroadcastId', () => {
    test('清空所有 segments', () => {
      segmentStore.createMany(broadcastId, ['A', 'B', 'C']);
      segmentStore.deleteByBroadcastId(broadcastId);
      expect(segmentStore.getByBroadcastId(broadcastId).length).toBe(0);
    });
  });

  describe('deleteAndReindex', () => {
    test('删除后重索引后续 segments', () => {
      segmentStore.createMany(broadcastId, ['A', 'B', 'C']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      segmentStore.deleteAndReindex(broadcastId, segs[1].id);
      const remaining = segmentStore.getByBroadcastId(broadcastId);
      expect(remaining.length).toBe(2);
      expect(remaining[0].text).toBe('A');
      expect(remaining[0].index).toBe(0);
      expect(remaining[1].text).toBe('C');
      expect(remaining[1].index).toBe(1);
    });
  });

  describe('countByIds', () => {
    test('统计匹配的 segment 数量', () => {
      segmentStore.createMany(broadcastId, ['A', 'B', 'C']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      expect(segmentStore.countByIds(broadcastId, [segs[0].id, segs[1].id])).toBe(2);
    });

    test('不匹配的 ID 不计入', () => {
      segmentStore.createMany(broadcastId, ['A']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      expect(segmentStore.countByIds(broadcastId, [segs[0].id, 99999])).toBe(1);
    });
  });

  describe('updateStyleTag', () => {
    test('写入 style_tag 并重置状态/音频', () => {
      segmentStore.createMany(broadcastId, ['句子']);
      const seg = segmentStore.getByBroadcastId(broadcastId)[0];
      segmentStore.updateStatus(seg.id, 'generated', '/audio/seg.wav');
      segmentStore.updateStyleTag(seg.id, '平静');
      const updated = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(updated.style_tag).toBe('平静');
      expect(updated.status).toBe('pending');
      expect(updated.audio_path).toBeNull();
    });
  });

  describe('updateText 保留 style_tag', () => {
    test('改文本不丢 style_tag', () => {
      segmentStore.createMany(broadcastId, ['旧']);
      const seg = segmentStore.getByBroadcastId(broadcastId)[0];
      segmentStore.updateStyleTag(seg.id, '严肃');
      segmentStore.updateText(seg.id, '新');
      const updated = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(updated.text).toBe('新');
      expect(updated.style_tag).toBe('严肃');
    });
  });

  describe('bulkUpdateStyleTags', () => {
    test('只重置 tag 变化的段', () => {
      segmentStore.createMany(broadcastId, ['A', 'B']);
      const segs = segmentStore.getByBroadcastId(broadcastId);
      segmentStore.updateStyleTag(segs[0].id, '平静');
      segmentStore.updateStatus(segs[0].id, 'generated', '/audio/a.wav');
      segmentStore.updateStatus(segs[1].id, 'generated', '/audio/b.wav');

      segmentStore.bulkUpdateStyleTags(broadcastId, [
        { id: segs[0].id, styleTag: '平静' }, // 不变
        { id: segs[1].id, styleTag: '严肃' }, // 变化
      ]);

      const after = segmentStore.getByBroadcastId(broadcastId);
      const a = after.find((s) => s.id === segs[0].id);
      const b = after.find((s) => s.id === segs[1].id);
      expect(a.style_tag).toBe('平静');
      expect(a.status).toBe('generated'); // 未变 → 不重置
      expect(b.style_tag).toBe('严肃');
      expect(b.status).toBe('pending');   // 变化 → 重置
      expect(b.audio_path).toBeNull();
    });
  });
});
