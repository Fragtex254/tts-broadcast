const express = require('express');
const router = express.Router();
const scheduler = require('../services/scheduler');
const { createScopedLogger } = require('../services/logger');

const logger = createScopedLogger('schedule-route');

/**
 * GET /api/schedules
 * 获取所有定时任务
 */
router.get('/', (req, res) => {
  try {
    const schedules = scheduler.getSchedules();
    res.json({ schedules });
  } catch (error) {
    logger.error({ err: error }, '获取任务列表失败');
    res.status(500).json({ error: '获取任务列表失败' });
  }
});

/**
 * POST /api/schedules
 * 创建定时任务
 */
router.post('/', (req, res) => {
  try {
    const { name, cron_expression, content_types } = req.body;

    if (!name || !cron_expression) {
      return res.status(400).json({ error: '请提供任务名称和 cron 表达式' });
    }

    const schedule = scheduler.addSchedule({
      name,
      cron_expression,
      content_types: content_types || '[]'
    });

    res.status(201).json({ schedule });
  } catch (error) {
    logger.error({ err: error }, '创建任务失败');
    res.status(400).json({ error: error.message });
  }
});

/**
 * PUT /api/schedules/:id
 * 更新定时任务
 */
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的任务 ID' });
    }

    const { name, cron_expression, content_types } = req.body;

    // 验证 content_types 格式
    if (content_types) {
      try {
        JSON.parse(content_types);
      } catch (e) {
        return res.status(400).json({ error: 'content_types 必须是有效的 JSON 字符串' });
      }
    }

    const schedule = scheduler.updateSchedule(id, {
      name,
      cron_expression,
      content_types
    });

    res.json({ schedule });
  } catch (error) {
    logger.error({
      err: error,
      hasScheduleId: Boolean(req.params.id),
      scheduleIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '更新任务失败');
    if (error.message === '任务不存在') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

/**
 * DELETE /api/schedules/:id
 * 删除定时任务
 */
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的任务 ID' });
    }

    // 检查任务是否存在
    const schedules = scheduler.getSchedules();
    const exists = schedules.some(s => s.id === id);
    if (!exists) {
      return res.status(404).json({ error: '任务不存在' });
    }

    scheduler.removeSchedule(id);
    res.json({ message: '任务已删除' });
  } catch (error) {
    logger.error({
      err: error,
      hasScheduleId: Boolean(req.params.id),
      scheduleIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '删除任务失败');
    res.status(400).json({ error: error.message });
  }
});

/**
 * POST /api/schedules/:id/toggle
 * 切换任务启用/禁用状态
 */
router.post('/:id/toggle', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: '无效的任务 ID' });
    }

    const schedule = scheduler.toggleSchedule(id);
    res.json({ schedule });
  } catch (error) {
    logger.error({
      err: error,
      hasScheduleId: Boolean(req.params.id),
      scheduleIdParamLength: typeof req.params.id === 'string' ? req.params.id.length : undefined,
    }, '切换任务状态失败');
    if (error.message === '任务不存在') {
      res.status(404).json({ error: error.message });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

module.exports = router;
