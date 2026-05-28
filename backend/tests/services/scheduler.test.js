// backend/tests/services/scheduler.test.js
const scheduler = require('../../src/services/scheduler');
const db = require('../../src/db');

describe('调度器服务', () => {
  afterEach(() => {
    scheduler.shutdown();
    db.prepare('DELETE FROM schedules').run();
  });

  test('添加定时任务', () => {
    const task = scheduler.addSchedule({
      name: '每日早报',
      cron_expression: '0 8 * * *',
      content_types: '["ai-models", "ai-products"]'
    });
    expect(task).toHaveProperty('id');
    expect(task.name).toBe('每日早报');
  });

  test('获取所有任务', () => {
    scheduler.addSchedule({
      name: '任务1',
      cron_expression: '0 8 * * *',
      content_types: '["ai-models"]'
    });
    scheduler.addSchedule({
      name: '任务2',
      cron_expression: '0 20 * * *',
      content_types: '["industry"]'
    });
    const tasks = scheduler.getSchedules();
    expect(tasks.length).toBe(2);
  });

  test('切换任务状态', () => {
    const task = scheduler.addSchedule({
      name: '测试任务',
      cron_expression: '0 8 * * *',
      content_types: '["ai-models"]'
    });
    const updated = scheduler.toggleSchedule(task.id);
    expect(updated.is_active).toBe(0);
  });

  test('删除任务', () => {
    const task = scheduler.addSchedule({
      name: '待删除',
      cron_expression: '0 8 * * *',
      content_types: '["ai-models"]'
    });
    scheduler.removeSchedule(task.id);
    const tasks = scheduler.getSchedules();
    expect(tasks.length).toBe(0);
  });
});
