// backend/src/services/scheduleStore.js
const db = require('../db');

/**
 * 获取所有启用的定时任务
 * @returns {Array} 启用任务列表
 */
function getActive() {
  return db.prepare('SELECT * FROM schedules WHERE is_active = 1').all();
}

/**
 * 获取所有定时任务
 * @returns {Array} 任务列表
 */
function getAll() {
  return db.prepare('SELECT * FROM schedules ORDER BY created_at DESC').all();
}

/**
 * 按 ID 获取定时任务
 * @param {number} id - 任务 ID
 * @returns {Object|undefined} 任务记录
 */
function getById(id) {
  return db.prepare('SELECT * FROM schedules WHERE id = ?').get(id);
}

/**
 * 创建定时任务
 * @param {Object} schedule
 * @param {string} schedule.name - 任务名称
 * @param {string} schedule.cron_expression - cron 表达式
 * @param {string} schedule.content_types - 内容分类 JSON 数组
 * @returns {Object} 新建任务
 */
function create({ name, cron_expression, content_types }) {
  const result = db.prepare(`
    INSERT INTO schedules (name, cron_expression, content_types) VALUES (?, ?, ?)
  `).run(name, cron_expression, content_types);

  return getById(result.lastInsertRowid);
}

/**
 * 更新定时任务
 * @param {number} id - 任务 ID
 * @param {Object} schedule - 更新后的完整任务配置
 * @returns {Object|undefined} 更新后的任务
 */
function update(id, { name, cron_expression, content_types }) {
  db.prepare(`
    UPDATE schedules
    SET name = ?, cron_expression = ?, content_types = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, cron_expression, content_types, id);

  return getById(id);
}

/**
 * 更新任务启用状态
 * @param {number} id - 任务 ID
 * @param {number} isActive - 0/1 启用状态
 * @returns {Object|undefined} 更新后的任务
 */
function updateActive(id, isActive) {
  db.prepare('UPDATE schedules SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(isActive, id);

  return getById(id);
}

/**
 * 标记任务最近运行时间
 * @param {number} id - 任务 ID
 */
function markLastRun(id) {
  db.prepare('UPDATE schedules SET last_run_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

/**
 * 删除定时任务
 * @param {number} id - 任务 ID
 * @returns {number} 删除条数
 */
function remove(id) {
  return db.prepare('DELETE FROM schedules WHERE id = ?').run(id).changes;
}

module.exports = {
  getActive,
  getAll,
  getById,
  create,
  update,
  updateActive,
  markLastRun,
  remove
};
