const express = require('express');
const contentTemplateStore = require('../services/contentTemplateStore');
const { createScopedLogger } = require('../services/logger');
const { validateId } = require('../utils/validation');

const router = express.Router();
const logger = createScopedLogger('content-template-route');

function validateTemplateBody(body) {
  const requiredStrings = ['name', 'platform', 'content_type', 'audience', 'tone', 'structure'];
  for (const field of requiredStrings) {
    if (typeof body[field] !== 'string' || body[field].trim().length === 0) {
      return `${field} 不能为空`;
    }
  }
  if (!Number.isInteger(body.target_duration_seconds) || body.target_duration_seconds < 15 || body.target_duration_seconds > 7200) {
    return '目标时长必须是 15 到 7200 秒之间的整数';
  }
  return null;
}

function toStoreParams(body) {
  return {
    name: body.name.trim(),
    platform: body.platform.trim(),
    contentType: body.content_type.trim(),
    targetDurationSeconds: body.target_duration_seconds,
    audience: body.audience.trim(),
    tone: body.tone.trim(),
    structure: body.structure.trim(),
    promptInstructions: typeof body.prompt_instructions === 'string' ? body.prompt_instructions.trim() : '',
    defaultVoiceConfig: body.default_voice_config || '{}',
  };
}

/** GET /api/content-templates - 获取全部创作模板 */
router.get('/', (req, res) => {
  try {
    res.json({ templates: contentTemplateStore.getAll() });
  } catch (error) {
    logger.error({ err: error }, '获取创作模板失败');
    res.status(500).json({ error: '获取创作模板失败' });
  }
});

/** POST /api/content-templates - 创建自定义创作模板 */
router.post('/', (req, res) => {
  try {
    const validationError = validateTemplateBody(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const template = contentTemplateStore.create(toStoreParams(req.body));
    res.status(201).json({ template });
  } catch (error) {
    logger.error({ err: error }, '创建创作模板失败');
    const isDuplicate = error?.code === 'SQLITE_CONSTRAINT_UNIQUE';
    res.status(isDuplicate ? 400 : 500).json({ error: isDuplicate ? '模板名称已存在' : '创建创作模板失败' });
  }
});

/** PUT /api/content-templates/:id - 更新自定义创作模板 */
router.put('/:id', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '模板 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const existing = contentTemplateStore.getById(idCheck.id);
    if (!existing) return res.status(404).json({ error: '创作模板不存在' });
    if (existing.is_builtin) return res.status(400).json({ error: '内置模板不能修改，请先复制为自定义模板' });
    const validationError = validateTemplateBody(req.body);
    if (validationError) return res.status(400).json({ error: validationError });
    const template = contentTemplateStore.update(idCheck.id, toStoreParams(req.body));
    res.json({ template });
  } catch (error) {
    logger.error({ err: error }, '更新创作模板失败');
    const isDuplicate = error?.code === 'SQLITE_CONSTRAINT_UNIQUE';
    res.status(isDuplicate ? 400 : 500).json({ error: isDuplicate ? '模板名称已存在' : '更新创作模板失败' });
  }
});

/** DELETE /api/content-templates/:id - 删除自定义创作模板 */
router.delete('/:id', (req, res) => {
  try {
    const idCheck = validateId(req.params.id, '模板 ID');
    if (!idCheck.valid) return res.status(400).json({ error: idCheck.error });
    const existing = contentTemplateStore.getById(idCheck.id);
    if (!existing) return res.status(404).json({ error: '创作模板不存在' });
    if (existing.is_builtin) return res.status(400).json({ error: '内置模板不能删除' });
    contentTemplateStore.deleteById(idCheck.id);
    res.json({ message: '创作模板已删除' });
  } catch (error) {
    logger.error({ err: error }, '删除创作模板失败');
    res.status(500).json({ error: '删除创作模板失败' });
  }
});

module.exports = router;
