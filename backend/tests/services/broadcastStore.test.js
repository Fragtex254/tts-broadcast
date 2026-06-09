const broadcastStore = require('../../src/services/broadcastStore');
const db = require('../../src/db');

describe('broadcastStore', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM segments').run();
    db.prepare('DELETE FROM broadcasts').run();
  });

  function insertBroadcast(overrides = {}) {
    const defaults = {
      title: '测试标题',
      content: '测试内容',
      audioPath: null,
      voiceType: 'preset',
      voiceConfig: '{"voice":"冰糖"}',
      sourceItems: null,
      status: 'pending',
      mode: 'whole'
    };
    const data = { ...defaults, ...overrides };
    return broadcastStore.create(data);
  }

  describe('create', () => {
    test('创建播报记录并返回完整对象', () => {
      const broadcast = insertBroadcast();
      expect(broadcast).toHaveProperty('id');
      expect(broadcast.title).toBe('测试标题');
      expect(broadcast.status).toBe('pending');
      expect(broadcast.mode).toBe('whole');
    });
  });

  describe('getById', () => {
    test('返回存在的记录', () => {
      const created = insertBroadcast();
      const found = broadcastStore.getById(created.id);
      expect(found.id).toBe(created.id);
      expect(found.title).toBe('测试标题');
    });

    test('不存在时返回 undefined', () => {
      expect(broadcastStore.getById(99999)).toBeUndefined();
    });
  });

  describe('getHistory', () => {
    test('返回分页列表', () => {
      insertBroadcast({ title: '第一条' });
      insertBroadcast({ title: '第二条' });
      const result = broadcastStore.getHistory({ limit: 10, offset: 0 });
      expect(result.length).toBe(2);
    });

    test('支持分页偏移', () => {
      for (let i = 0; i < 5; i++) insertBroadcast({ title: `第${i}条` });
      const page2 = broadcastStore.getHistory({ limit: 2, offset: 2 });
      expect(page2.length).toBe(2);
    });
  });

  describe('count 函数', () => {
    test('countAll 返回总数', () => {
      insertBroadcast();
      insertBroadcast();
      expect(broadcastStore.countAll()).toBe(2);
    });

    test('countUnsaved 统计未保存', () => {
      const b = insertBroadcast();
      insertBroadcast();
      expect(broadcastStore.countUnsaved()).toBe(2);
      broadcastStore.toggleSaved(b.id);
      expect(broadcastStore.countUnsaved()).toBe(1);
    });

    test('countSaved 统计已保存', () => {
      const b = insertBroadcast();
      expect(broadcastStore.countSaved()).toBe(0);
      broadcastStore.toggleSaved(b.id);
      expect(broadcastStore.countSaved()).toBe(1);
    });
  });

  describe('toggleSaved', () => {
    test('切换未保存为已保存', () => {
      const b = insertBroadcast();
      const result = broadcastStore.toggleSaved(b.id);
      expect(result.newSaved).toBe(1);
      expect(result.broadcast.saved).toBe(1);
    });

    test('切换已保存为未保存', () => {
      const b = insertBroadcast();
      broadcastStore.toggleSaved(b.id);
      const result = broadcastStore.toggleSaved(b.id);
      expect(result.newSaved).toBe(0);
    });
  });

  describe('updateAudioPath', () => {
    test('更新音频路径', () => {
      const b = insertBroadcast();
      broadcastStore.updateAudioPath(b.id, '/audio/test.wav');
      const updated = broadcastStore.getById(b.id);
      expect(updated.audio_path).toBe('/audio/test.wav');
    });
  });

  describe('updateVoiceConfig', () => {
    test('更新音色配置', () => {
      const b = insertBroadcast();
      broadcastStore.updateVoiceConfig(b.id, {
        voiceType: 'design',
        voiceConfig: '{"voiceDesign":"温柔女声"}'
      });
      const updated = broadcastStore.getById(b.id);
      expect(updated.voice_type).toBe('design');
    });
  });

  describe('deleteById', () => {
    test('删除并返回旧记录', () => {
      const b = insertBroadcast({ audioPath: '/audio/old.wav' });
      const deleted = broadcastStore.deleteById(b.id);
      expect(deleted.id).toBe(b.id);
      expect(broadcastStore.getById(b.id)).toBeUndefined();
    });

    test('不存在时返回 undefined', () => {
      expect(broadcastStore.deleteById(99999)).toBeUndefined();
    });
  });

  describe('getOldestUnsaved / getOldestSaved', () => {
    test('getOldestUnsaved 返回最旧的未保存记录', () => {
      insertBroadcast({ title: '旧' });
      insertBroadcast({ title: '新' });
      const oldest = broadcastStore.getOldestUnsaved(1);
      expect(oldest.length).toBe(1);
      expect(oldest[0].title).toBe('旧');
    });

    test('getOldestSaved 返回最旧的已保存记录', () => {
      const b1 = insertBroadcast({ title: '旧保存' });
      const b2 = insertBroadcast({ title: '新保存' });
      broadcastStore.toggleSaved(b1.id);
      broadcastStore.toggleSaved(b2.id);
      const oldest = broadcastStore.getOldestSaved(1);
      expect(oldest.length).toBe(1);
      expect(oldest[0].title).toBe('旧保存');
    });
  });

  describe('clearAudioAndSetMode', () => {
    test('清空音频路径并设置 mode', () => {
      const b = insertBroadcast({ audioPath: '/audio/test.wav', mode: 'whole' });
      broadcastStore.clearAudioAndSetMode(b.id, 'segmented');
      const updated = broadcastStore.getById(b.id);
      expect(updated.audio_path).toBeNull();
      expect(updated.mode).toBe('segmented');
    });
  });

  describe('updateStatus', () => {
    test('更新状态', () => {
      const b = insertBroadcast({ status: 'pending' });
      broadcastStore.updateStatus(b.id, 'generated');
      const updated = broadcastStore.getById(b.id);
      expect(updated.status).toBe('generated');
    });
  });

  describe('batchDeleteByIds', () => {
    test('应该批量删除多条记录', () => {
      const b1 = insertBroadcast({ title: 'Test 1' });
      const b2 = insertBroadcast({ title: 'Test 2' });
      const b3 = insertBroadcast({ title: 'Test 3' });

      const result = broadcastStore.batchDeleteByIds([b1.id, b3.id]);

      expect(result.deleted).toBe(2);
      expect(result.failed).toBe(0);
      expect(broadcastStore.getById(b1.id)).toBeUndefined();
      expect(broadcastStore.getById(b2.id)).toBeDefined();
      expect(broadcastStore.getById(b3.id)).toBeUndefined();
    });

    test('应该处理不存在的 ID', () => {
      const b1 = insertBroadcast({ title: 'Test 1' });

      const result = broadcastStore.batchDeleteByIds([b1.id, 99999]);

      expect(result.deleted).toBe(1);
      expect(result.failed).toBe(1);
    });

    test('应该处理空数组', () => {
      const result = broadcastStore.batchDeleteByIds([]);

      expect(result.deleted).toBe(0);
      expect(result.failed).toBe(0);
    });
  });
});
