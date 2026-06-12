const express = require('express');
const router = express.Router();
const db = require('../db');
const mimo = require('../services/mimo');

/**
 * GET /api/settings
 * 获取所有设置
 */
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = JSON.parse(row.value);
    });
    res.json({ settings });
  } catch (error) {
    console.error('获取设置失败:', error);
    res.status(500).json({ error: '获取设置失败' });
  }
});

/**
 * PUT /api/settings
 * 更新设置
 */
router.put('/', (req, res) => {
  try {
    const updates = req.body;

    // 验证输入
    if (!updates || typeof updates !== 'object' || Array.isArray(updates) || Object.keys(updates).length === 0) {
      return res.status(400).json({ error: '请提供有效的设置对象' });
    }

    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `);

    const transaction = db.transaction(() => {
      for (const [key, value] of Object.entries(updates)) {
        upsert.run(key, JSON.stringify(value), JSON.stringify(value));
      }
    });

    transaction();

    // 返回更新后的设置
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = JSON.parse(row.value);
    });

    res.json({ settings });
  } catch (error) {
    console.error('更新设置失败:', error);
    res.status(500).json({ error: '更新设置失败' });
  }
});

/**
 * POST /api/settings/test-key
 * 测试 API Key
 */
router.post('/test-key', async (req, res) => {
  try {
    const { type, apiKey, apiFormat, baseUrl, model } = req.body || {};
    const mimoType = type === 'tts' ? 'tts' : 'anthropic';
    const keyToTest = typeof apiKey === 'string' ? apiKey.trim() : undefined;
    const llmConfig = mimoType === 'tts' ? undefined : { apiFormat, baseUrl, model };
    const isValid = await mimo.testApiKey(mimoType, keyToTest || undefined, llmConfig);
    res.json({ valid: isValid });
  } catch (error) {
    console.error('测试 API Key 失败:', error);
    res.json({ valid: false, error: error.message });
  }
});

/**
 * POST /api/settings/llm-models
 * 根据当前输入的 LLM Base URL 和 API Key 获取模型列表
 */
router.post('/llm-models', async (req, res) => {
  try {
    const { baseUrl, apiKey } = req.body || {};
    if (!baseUrl || typeof baseUrl !== 'string') {
      return res.status(400).json({ error: '请提供 LLM Base URL' });
    }

    const keyToUse = typeof apiKey === 'string' ? apiKey.trim() : '';
    const result = await mimo.fetchModelsForConfig({
      baseUrl: baseUrl.trim(),
      apiKey: keyToUse
    });

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message || '获取模型列表失败' });
  }
});

module.exports = router;
