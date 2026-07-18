// backend/src/services/scheduler.js
const cron = require('node-cron');
const scheduleStore = require('./scheduleStore');
const { createScopedLogger } = require('./logger');

const logger = createScopedLogger('scheduler');

// 存储活跃的 cron 任务
const activeJobs = new Map();
let onTriggerCallback = null;

const EXECUTION_UNAVAILABLE_MESSAGE = '自动化执行器尚未配置，当前不能启用任务';

class AutomationExecutionUnavailableError extends Error {
  constructor() {
    super(EXECUTION_UNAVAILABLE_MESSAGE);
    this.name = 'AutomationExecutionUnavailableError';
    this.code = 'AUTOMATION_EXECUTION_UNAVAILABLE';
  }
}

/**
 * 获取当前进程是否具备真实自动化执行能力。
 * @returns {{available: boolean, state: 'available'|'unavailable', reason: string}}
 */
function getExecutionState() {
  const available = typeof onTriggerCallback === 'function';
  return {
    available,
    state: available ? 'available' : 'unavailable',
    reason: available ? '' : '自动化执行器尚未配置',
  };
}

function withRuntimeState(schedule) {
  if (!schedule) return schedule;
  let runtimeState = 'unavailable';
  if (onTriggerCallback) {
    if (!schedule.is_active) runtimeState = 'inactive';
    else runtimeState = activeJobs.has(schedule.id) ? 'scheduled' : 'not_scheduled';
  }
  return { ...schedule, runtime_state: runtimeState };
}

/**
 * 初始化调度器，加载所有活跃任务
 * @param {Function} [onTrigger] - 任务触发时的回调函数
 */
function init(onTrigger) {
  onTriggerCallback = typeof onTrigger === 'function' ? onTrigger : null;
  const schedules = scheduleStore.getActive();
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
  onTriggerCallback = null;
  logger.info({}, '调度器已关闭');
}

/**
 * 启动 cron 任务
 * @param {Object} schedule - 任务配置
 */
function startJob(schedule) {
  if (activeJobs.has(schedule.id)) {
    activeJobs.get(schedule.id).stop();
    activeJobs.delete(schedule.id);
  }

  if (!cron.validate(schedule.cron_expression)) {
    logger.warn({
      scheduleId: schedule.id,
      hasCronExpression: Boolean(schedule.cron_expression),
      cronExpressionLength: typeof schedule.cron_expression === 'string' ? schedule.cron_expression.length : undefined,
    }, '无效的 cron 表达式');
    return;
  }

  if (!onTriggerCallback) {
    logger.warn({ scheduleId: schedule.id }, '未配置自动化执行器，跳过定时任务启动');
    return;
  }

  const job = cron.schedule(schedule.cron_expression, async () => {
    logger.info({
      scheduleId: schedule.id,
      hasScheduleName: Boolean(schedule.name),
      scheduleNameLength: typeof schedule.name === 'string' ? schedule.name.length : undefined,
    }, '执行定时任务');
    try {
      await onTriggerCallback(schedule);
      // 任务成功后更新时间
      scheduleStore.markLastRun(schedule.id);
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

  const executionAvailable = getExecutionState().available;
  const task = scheduleStore.create({
    name,
    cron_expression,
    content_types,
    isActive: executionAvailable ? 1 : 0,
  });
  if (task.is_active) startJob(task);
  return withRuntimeState(task);
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

  const existing = scheduleStore.getById(id);
  if (!existing) throw new Error('任务不存在');

  stopJob(id);
  const updated = scheduleStore.update(id, {
    name: name || existing.name,
    cron_expression: cron_expression || existing.cron_expression,
    content_types: content_types || existing.content_types
  });
  if (updated.is_active) {
    startJob(updated);
  }

  return withRuntimeState(updated);
}

/**
 * 切换任务启用/禁用状态
 * @param {number} id - 任务 ID
 * @returns {Object} 更新后的任务
 */
function toggleSchedule(id) {
  const task = scheduleStore.getById(id);
  if (!task) throw new Error('任务不存在');

  const newStatus = task.is_active ? 0 : 1;
  if (newStatus && !getExecutionState().available) {
    throw new AutomationExecutionUnavailableError();
  }
  const updated = scheduleStore.updateActive(id, newStatus);

  if (newStatus) {
    startJob(updated);
  } else {
    stopJob(id);
  }

  return withRuntimeState(updated);
}

/**
 * 删除定时任务
 * @param {number} id - 任务 ID
 */
function removeSchedule(id) {
  stopJob(id);
  scheduleStore.remove(id);
}

/**
 * 获取所有任务
 * @returns {Array} 任务列表
 */
function getSchedules() {
  return scheduleStore.getAll().map(withRuntimeState);
}

module.exports = {
  AutomationExecutionUnavailableError,
  EXECUTION_UNAVAILABLE_MESSAGE,
  init,
  shutdown,
  addSchedule,
  updateSchedule,
  toggleSchedule,
  removeSchedule,
  getSchedules,
  getExecutionState,
};
