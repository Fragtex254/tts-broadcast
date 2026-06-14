// backend/src/services/scheduler.js
const cron = require('node-cron');
const db = require('../db');
const { createScopedLogger } = require('./logger');

const logger = createScopedLogger('scheduler');

// 存储活跃的 cron 任务
const activeJobs = new Map();
let onTriggerCallback = null;

/**
 * 初始化调度器，加载所有活跃任务
 * @param {Function} [onTrigger] - 任务触发时的回调函数
 */
function init(onTrigger) {
  if (onTrigger) {
    onTriggerCallback = onTrigger;
  }
  const schedules = db.prepare('SELECT * FROM schedules WHERE is_active = 1').all();
  schedules.forEach(schedule => {
    startJob(schedule);
  });
  logger.info({ count: schedules.length }, '已加载定时任务');
}

/**
 * 关闭调度器，停止所有任务
 */
function shutdown() {
  for (const [id, job] of activeJobs) {
    job.stop();
  }
  activeJobs.clear();
  logger.info({}, '调度器已关闭');
}

/**
 * 启动 cron 任务
 * @param {Object} schedule - 任务配置
 */
function startJob(schedule) {
  if (activeJobs.has(schedule.id)) {
    activeJobs.get(schedule.id).stop();
  }

  if (!cron.validate(schedule.cron_expression)) {
    logger.warn({
      scheduleId: schedule.id,
      hasCronExpression: Boolean(schedule.cron_expression),
      cronExpressionLength: typeof schedule.cron_expression === 'string' ? schedule.cron_expression.length : undefined,
    }, '无效的 cron 表达式');
    return;
  }

  const job = cron.schedule(schedule.cron_expression, async () => {
    logger.info({
      scheduleId: schedule.id,
      hasScheduleName: Boolean(schedule.name),
      scheduleNameLength: typeof schedule.name === 'string' ? schedule.name.length : undefined,
    }, '执行定时任务');
    try {
      if (onTriggerCallback) {
        await onTriggerCallback(schedule);
      }
      // 任务成功后更新时间
      db.prepare('UPDATE schedules SET last_run_at = CURRENT_TIMESTAMP WHERE id = ?').run(schedule.id);
    } catch (error) {
      logger.error({
        err: error,
        scheduleId: schedule.id,
        hasScheduleName: Boolean(schedule.name),
        scheduleNameLength: typeof schedule.name === 'string' ? schedule.name.length : undefined,
      }, '定时任务执行失败');
    }
  });

  activeJobs.set(schedule.id, job);
}

/**
 * 停止 cron 任务
 * @param {number} id - 任务 ID
 */
function stopJob(id) {
  if (activeJobs.has(id)) {
    activeJobs.get(id).stop();
    activeJobs.delete(id);
  }
}

/**
 * 添加定时任务
 * @param {Object} config
 * @param {string} config.name - 任务名称
 * @param {string} config.cron_expression - cron 表达式
 * @param {string} config.content_types - 内容分类 JSON 数组
 * @returns {Object} 创建的任务
 */
function addSchedule({ name, cron_expression, content_types }) {
  if (!cron.validate(cron_expression)) {
    throw new Error('无效的 cron 表达式');
  }

  if (content_types) {
    try {
      JSON.parse(content_types);
    } catch (e) {
      throw new Error('content_types 必须是有效的 JSON 字符串');
    }
  }

  const result = db.prepare(`
    INSERT INTO schedules (name, cron_expression, content_types) VALUES (?, ?, ?)
  `).run(name, cron_expression, content_types);

  const task = db.prepare('SELECT * FROM schedules WHERE id = ?').get(result.lastInsertRowid);
  startJob(task);
  return task;
}

/**
 * 更新定时任务
 * @param {number} id - 任务 ID
 * @param {Object} updates - 更新内容
 * @returns {Object} 更新后的任务
 */
function updateSchedule(id, { name, cron_expression, content_types }) {
  if (cron_expression && !cron.validate(cron_expression)) {
    throw new Error('无效的 cron 表达式');
  }

  const existing = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  if (!existing) throw new Error('任务不存在');

  db.prepare(`
    UPDATE schedules SET name = ?, cron_expression = ?, content_types = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(
    name || existing.name,
    cron_expression || existing.cron_expression,
    content_types || existing.content_types,
    id
  );

  stopJob(id);
  const updated = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  if (updated.is_active) {
    startJob(updated);
  }

  return updated;
}

/**
 * 切换任务启用/禁用状态
 * @param {number} id - 任务 ID
 * @returns {Object} 更新后的任务
 */
function toggleSchedule(id) {
  const task = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
  if (!task) throw new Error('任务不存在');

  const newStatus = task.is_active ? 0 : 1;
  db.prepare('UPDATE schedules SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, id);

  if (newStatus) {
    const updated = db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
    startJob(updated);
  } else {
    stopJob(id);
  }

  return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
}

/**
 * 删除定时任务
 * @param {number} id - 任务 ID
 */
function removeSchedule(id) {
  stopJob(id);
  db.prepare('DELETE FROM schedules WHERE id = ?').run(id);
}

/**
 * 获取所有任务
 * @returns {Array} 任务列表
 */
function getSchedules() {
  return db.prepare('SELECT * FROM schedules ORDER BY created_at DESC').all();
}

module.exports = {
  init,
  shutdown,
  addSchedule,
  updateSchedule,
  toggleSchedule,
  removeSchedule,
  getSchedules
};
