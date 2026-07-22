const express = require('express');
const router = express.Router();
const db = require('../db');
const mimo = require('../services/mimo');
const { createScopedLogger } = require('../services/logger');
const { sendInternalError } = require('../utils/httpResponse');

const logger = createScopedLogger('settings-route');

const SECRET_SETTING_PATTERN = /(?:api[_-]?key|token|secret|password)/i;
const MASKED_SECRET_PREFIX = '••••••••';

function isSecretSettingKey(key) {
  return SECRET_SETTING_PATTERN.test(key);
}

function maskSecret(value) {
  const secret = typeof value === 'string' ? value : '';
  return {
    masked: secret ? `${MASKED_SECRET_PREFIX}${secret.slice(-4)}` : '',
    is_set: Boolean(secret)
  };
}

function isMaskedSecretPlaceholder(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return typeof value.masked === 'string' && typeof value.is_set === 'boolean';
  }
  return typeof value === 'string' && value.startsWith(MASKED_SECRET_PREFIX);
}

function buildPublicSettings(rows) {
  const settings = {};
  rows.forEach((row) => {
    const value = JSON.parse(row.value);
    settings[row.key] = isSecretSettingKey(row.key) ? maskSecret(value) : value;
  });
  return settings;
}

function readSubmittedSecret(value) {
  if (isMaskedSecretPlaceholder(value)) return undefined;
  if (typeof value !== 'string') return undefined;
  return value.trim() ? value : undefined;
}

/**
 * GET /api/settings
 * 获取所有设置
 */
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM settings').all();
    const settings = buildPublicSettings(rows);
    res.json({ settings });
  } catch (error) {
    logger.error({ err: error }, '获取设置失败');
    sendInternalError(res);
  }
});

/**
 * PUT /api/settings
 * 更新设置
 */
router.put('/', (req, res) => {
  try {
    const requestedUpdates = req.body;

    // 验证输入
    if (!requestedUpdates || typeof requestedUpdates !== 'object' || Array.isArray(requestedUpdates) || Object.keys(requestedUpdates).length === 0) {
      return res.status(400).json({ error: '请提供有效的设置对象' });
    }
    const updates = { ...requestedUpdates };
    for (const [key, value] of Object.entries(updates)) {
      if (!isSecretSettingKey(key)) continue;
      const submittedSecret = readSubmittedSecret(value);
      if (submittedSecret === undefined) {
        delete updates[key];
      } else {
        updates[key] = submittedSecret;
      }
    }
    if (updates.asr_provider === 'moss_asr') {
      updates.asr_provider = 'wsl_asr';
      updates.wsl_asr_engine = 'moss';
    }
    if (updates.asr_provider && !['mimo', 'qwen_mlx', 'wsl_asr'].includes(updates.asr_provider)) {
      return res.status(400).json({ error: 'ASR 服务位置无效' });
    }
    if (updates.wsl_asr_engine && !['qwen', 'moss'].includes(updates.wsl_asr_engine)) {
      return res.status(400).json({ error: 'WSL ASR 引擎无效' });
    }
    if (updates.embedding_enabled !== undefined && typeof updates.embedding_enabled !== 'boolean') {
      return res.status(400).json({ error: 'Embedding 启用状态无效' });
    }
    for (const key of ['embedding_base_url', 'embedding_api_key', 'embedding_model']) {
      if (updates[key] !== undefined && typeof updates[key] !== 'string') {
        return res.status(400).json({ error: `${key} 必须是字符串` });
      }
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
    const settings = buildPublicSettings(rows);

    res.json({ settings });
  } catch (error) {
    logger.error({ err: error }, '更新设置失败');
    sendInternalError(res);
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
    const keyToTest = readSubmittedSecret(apiKey);
    const llmConfig = mimoType === 'tts' ? undefined : { apiFormat, baseUrl, model };
    const isValid = await mimo.testApiKey(mimoType, keyToTest || undefined, llmConfig);
    if (!isValid) {
      return res.status(400).json({
        valid: false,
        error: 'API Key 验证失败，请检查密钥与连接配置',
      });
    }
    res.json({ valid: isValid });
  } catch (error) {
    logger.error({ err: error }, '测试 API Key 失败');
    res.status(400).json({ valid: false, error: error.message || 'API Key 验证失败' });
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
      return res.status(400).json({ valid: false, error: '请提供 LLM Base URL' });
    }

    let keyToUse = readSubmittedSecret(apiKey);
    if (!keyToUse) {
      try {
        keyToUse = mimo.getApiKey('anthropic');
      } catch {
        keyToUse = '';
      }
    }
    const result = await mimo.fetchModelsForConfig({
      baseUrl: baseUrl.trim(),
      apiKey: keyToUse
    });

    res.json(result);
  } catch (error) {
    logger.warn({ err: error }, '获取 LLM 模型列表失败');
    res.status(400).json({ valid: false, error: error.message || '获取模型列表失败' });
  }
});

module.exports = router;
