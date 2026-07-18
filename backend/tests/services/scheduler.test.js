// backend/tests/services/scheduler.test.js
const scheduler = require('../../src/services/scheduler');
const db = require('../../src/db');
const cron = require('node-cron');

describe('调度器服务', () => {
  afterEach(() => {
    scheduler.shutdown();
    db.prepare('DELETE FROM schedules').run();
    jest.restoreAllMocks();
  });

  test('没有业务执行器时只保存配置，不启动会伪报成功的 cron', () => {
    const scheduleSpy = jest.spyOn(cron, 'schedule');

    const task = scheduler.addSchedule({
      name: '尚未接线的任务',
      cron_expression: '0 8 * * *',
      content_types: '[]'
    });

    expect(task).toHaveProperty('id');
    expect(scheduleSpy).not.toHaveBeenCalled();
    expect(task.is_active).toBe(0);
    expect(task.runtime_state).toBe('unavailable');
    expect(task.last_run_at).toBeNull();
    expect(scheduler.getExecutionState()).toEqual({
      available: false,
      state: 'unavailable',
      reason: '自动化执行器尚未配置',
    });
  });

  test('没有执行器时不能启用停用状态的任务', () => {
    const task = scheduler.addSchedule({
      name: '待启用任务',
      cron_expression: '0 8 * * *',
      content_types: '[]'
    });

    expect(() => scheduler.toggleSchedule(task.id)).toThrow(
      expect.objectContaining({
        code: 'AUTOMATION_EXECUTION_UNAVAILABLE',
        message: '自动化执行器尚未配置，当前不能启用任务',
      })
    );
    expect(db.prepare('SELECT is_active FROM schedules WHERE id = ?').get(task.id).is_active).toBe(0);
  });

  test('旧 active 配置保留，但读取时明确标记运行态不可用且不启动 cron', () => {
    const scheduleSpy = jest.spyOn(cron, 'schedule');
    const stored = db.prepare(`
      INSERT INTO schedules (name, cron_expression, content_types, is_active)
      VALUES (?, ?, ?, 1)
    `).run('历史启用配置', '0 8 * * *', '[]');

    scheduler.init();

    const task = scheduler.getSchedules().find((item) => item.id === Number(stored.lastInsertRowid));
    expect(task).toMatchObject({ is_active: 1, runtime_state: 'unavailable' });
    expect(scheduleSpy).not.toHaveBeenCalled();
  });

  test('有业务执行器时只在执行成功后记录最近运行时间', async () => {
    let runScheduledTask;
    const stop = jest.fn();
    const scheduleSpy = jest.spyOn(cron, 'schedule').mockImplementation((expression, callback) => {
      runScheduledTask = callback;
      return { stop };
    });
    const execute = jest.fn().mockResolvedValue(undefined);
    scheduler.init(execute);

    const task = scheduler.addSchedule({
      name: '真实执行任务',
      cron_expression: '0 8 * * *',
      content_types: '[]'
    });

    expect(scheduleSpy).toHaveBeenCalledWith('0 8 * * *', expect.any(Function));
    expect(task).toMatchObject({ is_active: 1, runtime_state: 'scheduled' });
    expect(scheduler.getExecutionState()).toEqual({ available: true, state: 'available', reason: '' });
    expect(scheduler.getSchedules().find((item) => item.id === task.id).last_run_at).toBeNull();

    await runScheduledTask();

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ id: task.id }));
    expect(scheduler.getSchedules().find((item) => item.id === task.id).last_run_at).not.toBeNull();
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
    scheduler.init(jest.fn().mockResolvedValue(undefined));
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
