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
      expect(segs[0].error_message).toBe('');
      expect(segs[0].playback_rate).toBe(1);
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

  describe('replaceAll', () => {
    test('仅重排已有段落时让旧序号上的 generating 快照回到 pending', () => {
      segmentStore.createMany(broadcastId, ['A', 'B']);
      const segments = segmentStore.getByBroadcastId(broadcastId);
      expect(segmentStore.tryStartGeneration(segments[0], 'replace-token')).toBe(true);

      segmentStore.replaceAll(broadcastId, [
        { id: segments[1].id, text: 'B', styleTag: '' },
        { id: segments[0].id, text: 'A', styleTag: '' },
      ]);

      expect(segmentStore.getByIdAndBroadcastId(segments[0].id, broadcastId)).toMatchObject({
        index: 1,
        status: 'pending',
      });
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

    test('失败状态保存错误原因，重新生成中会清空错误原因', () => {
      segmentStore.createMany(broadcastId, ['测试']);
      const seg = segmentStore.getByBroadcastId(broadcastId)[0];
      segmentStore.updateStatus(seg.id, 'failed', null, 'MiMo API 请求过于频繁');
      const failed = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(failed.error_message).toBe('MiMo API 请求过于频繁');

      segmentStore.updateStatus(seg.id, 'generating');
      const generating = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(generating.error_message).toBe('');
    });
  });

  describe('生成快照 CAS', () => {
    test('仅在 segment 的归属、文本、风格、序号与启动快照一致时收口生成结果', () => {
      segmentStore.createMany(broadcastId, ['启动文本']);
      const snapshot = segmentStore.getByBroadcastId(broadcastId)[0];

      const generationToken = 'finish-token';
      const started = segmentStore.tryStartGeneration(snapshot, generationToken);
      expect(started).toBe(true);

      const completed = segmentStore.tryFinishGeneration({
        snapshot,
        generationToken,
        status: 'generated',
        audioPath: '/audio/segment_unique.wav',
      });

      expect(completed).toEqual({ applied: true, replacedAudioPath: null });
      expect(segmentStore.getByIdAndBroadcastId(snapshot.id, broadcastId)).toMatchObject({
        text: '启动文本',
        status: 'generated',
        audio_path: '/audio/segment_unique.wav',
      });
    });

    test('生成期间文本改变时拒绝旧快照完成且保留新文本的 pending 状态', () => {
      segmentStore.createMany(broadcastId, ['旧文本']);
      const snapshot = segmentStore.getByBroadcastId(broadcastId)[0];
      const generationToken = 'text-change-token';
      expect(segmentStore.tryStartGeneration(snapshot, generationToken)).toBe(true);

      segmentStore.updateText(snapshot.id, '用户编辑后的新文本');
      const completed = segmentStore.tryFinishGeneration({
        snapshot,
        generationToken,
        status: 'generated',
        audioPath: '/audio/stale.wav',
      });

      expect(completed).toEqual({ applied: false, replacedAudioPath: null });
      expect(segmentStore.getByIdAndBroadcastId(snapshot.id, broadcastId)).toMatchObject({
        text: '用户编辑后的新文本',
        status: 'pending',
        audio_path: null,
      });
    });

    test('生成期间风格改变时拒绝旧快照写入 failed 状态', () => {
      segmentStore.createMany(broadcastId, ['相同文本']);
      const snapshot = segmentStore.getByBroadcastId(broadcastId)[0];
      const generationToken = 'style-change-token';
      expect(segmentStore.tryStartGeneration(snapshot, generationToken)).toBe(true);

      segmentStore.updateStyleTag(snapshot.id, '用户新风格');
      const failed = segmentStore.tryFinishGeneration({
        snapshot,
        generationToken,
        status: 'failed',
        errorMessage: '旧快照调用失败',
      });

      expect(failed).toEqual({ applied: false, replacedAudioPath: null });
      expect(segmentStore.getByIdAndBroadcastId(snapshot.id, broadcastId)).toMatchObject({
        style_tag: '用户新风格',
        status: 'pending',
        error_message: '',
      });
    });

    test('遗留 generating 被新 token 接管后拒绝旧请求的 ABA 写回', () => {
      segmentStore.createMany(broadcastId, ['同一份文本']);
      const firstSnapshot = segmentStore.getByBroadcastId(broadcastId)[0];
      expect(segmentStore.tryStartGeneration(firstSnapshot, 'old-token')).toBe(true);

      const recoveredSnapshot = segmentStore.getByIdAndBroadcastId(firstSnapshot.id, broadcastId);
      expect(recoveredSnapshot.status).toBe('generating');
      expect(segmentStore.tryStartGeneration(recoveredSnapshot, 'new-token')).toBe(true);

      expect(segmentStore.tryFinishGeneration({
        snapshot: firstSnapshot,
        generationToken: 'old-token',
        status: 'generated',
        audioPath: '/audio/old.wav',
      })).toEqual({ applied: false, replacedAudioPath: null });

      expect(segmentStore.tryFinishGeneration({
        snapshot: recoveredSnapshot,
        generationToken: 'new-token',
        status: 'generated',
        audioPath: '/audio/new.wav',
      })).toEqual({ applied: true, replacedAudioPath: null });
      expect(segmentStore.getByIdAndBroadcastId(firstSnapshot.id, broadcastId)).toMatchObject({
        status: 'generated',
        audio_path: '/audio/new.wav',
      });
    });
  });

  describe('playbackRate', () => {
    test('单段更新 playback_rate 不重置音频状态', () => {
      segmentStore.createMany(broadcastId, ['测试']);
      const seg = segmentStore.getByBroadcastId(broadcastId)[0];
      segmentStore.updateStatus(seg.id, 'generated', '/audio/seg.wav');
      segmentStore.updatePlaybackRate(seg.id, 1.5);
      const updated = segmentStore.getByIdAndBroadcastId(seg.id, broadcastId);
      expect(updated.playback_rate).toBe(1.5);
      expect(updated.status).toBe('generated');
      expect(updated.audio_path).toBe('/audio/seg.wav');
    });

    test('批量更新 playback_rate', () => {
      segmentStore.createMany(broadcastId, ['A', 'B']);
      segmentStore.bulkUpdatePlaybackRate(broadcastId, 0.75);
      const segments = segmentStore.getByBroadcastId(broadcastId);
      expect(segments.map((s) => s.playback_rate)).toEqual([0.75, 0.75]);
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
      expect(updated.error_message).toBe('');
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

    test('重排时把尚在生成的旧序号快照恢复为 pending', () => {
      segmentStore.createMany(broadcastId, ['A', 'B']);
      const segments = segmentStore.getByBroadcastId(broadcastId);
      expect(segmentStore.tryStartGeneration(segments[0], 'reorder-token')).toBe(true);

      segmentStore.reorder(broadcastId, [segments[1].id, segments[0].id]);

      const reordered = segmentStore.getByBroadcastId(broadcastId);
      expect(reordered.find((segment) => segment.id === segments[0].id)).toMatchObject({
        index: 1,
        status: 'pending',
      });
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

    test('重索引不改写以 segment ID 和生成 token 命名的稳定音频路径', () => {
      segmentStore.createMany(broadcastId, ['A', 'B']);
      const segments = segmentStore.getByBroadcastId(broadcastId);
      const stablePath = `/audio/segment_${broadcastId}_${segments[1].id}_unique.wav`;
      segmentStore.updateStatus(segments[1].id, 'generated', stablePath);

      segmentStore.deleteAndReindex(broadcastId, segments[0].id);

      expect(segmentStore.getByIdAndBroadcastId(segments[1].id, broadcastId)).toMatchObject({
        index: 0,
        status: 'generated',
        audio_path: stablePath,
      });
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
