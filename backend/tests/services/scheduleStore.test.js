const db = require('../../src/db');
const scheduleStore = require('../../src/services/scheduleStore');

describe('scheduleStore', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM schedules').run();
  });

  test('create 创建任务并返回完整记录', () => {
    const schedule = scheduleStore.create({
      name: '每日早报',
      cron_expression: '0 8 * * *',
      content_types: '["ai-models"]'
    });

    expect(schedule).toHaveProperty('id');
    expect(schedule.name).toBe('每日早报');
    expect(schedule.is_active).toBe(1);
  });

  test('getActive 只返回启用任务', () => {
    const active = scheduleStore.create({
      name: '启用任务',
      cron_expression: '0 8 * * *',
      content_types: '[]'
    });
    const inactive = scheduleStore.create({
      name: '禁用任务',
      cron_expression: '0 9 * * *',
      content_types: '[]'
    });
    scheduleStore.updateActive(inactive.id, 0);

    expect(scheduleStore.getActive()).toEqual([expect.objectContaining({ id: active.id })]);
  });

  test('update 更新任务配置', () => {
    const schedule = scheduleStore.create({
      name: '原始任务',
      cron_expression: '0 8 * * *',
      content_types: '["ai-models"]'
    });

    const updated = scheduleStore.update(schedule.id, {
      name: '更新任务',
      cron_expression: '0 10 * * *',
      content_types: '["industry"]'
    });

    expect(updated.name).toBe('更新任务');
    expect(updated.cron_expression).toBe('0 10 * * *');
    expect(updated.content_types).toBe('["industry"]');
  });

  test('remove 删除任务并返回删除条数', () => {
    const schedule = scheduleStore.create({
      name: '待删除',
      cron_expression: '0 8 * * *',
      content_types: '[]'
    });

    expect(scheduleStore.remove(schedule.id)).toBe(1);
    expect(scheduleStore.getById(schedule.id)).toBeUndefined();
  });
});
