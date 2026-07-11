const db = require('../db');

const TEMPLATE_FIELDS = `
  id, name, platform, content_type, target_duration_seconds, audience, tone,
  structure, prompt_instructions, default_voice_config, is_builtin, created_at, updated_at
`;

/**
 * 获取全部创作模板。
 * @returns {Array} 创作模板列表
 */
function getAll() {
  return db.prepare(`
    SELECT ${TEMPLATE_FIELDS}
    FROM content_templates
    ORDER BY is_builtin DESC, created_at ASC, id ASC
  `).all();
}

/**
 * 根据 ID 获取创作模板。
 * @param {number} id - 模板 ID
 * @returns {Object|undefined} 创作模板
 */
function getById(id) {
  return db.prepare(`SELECT ${TEMPLATE_FIELDS} FROM content_templates WHERE id = ?`).get(id);
}

/**
 * 创建自定义创作模板。
 * @param {Object} params - 模板字段
 * @returns {Object} 新模板
 */
function create({ name, platform, contentType, targetDurationSeconds, audience, tone, structure, promptInstructions, defaultVoiceConfig }) {
  const result = db.prepare(`
    INSERT INTO content_templates (
      name, platform, content_type, target_duration_seconds, audience, tone,
      structure, prompt_instructions, default_voice_config, is_builtin
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).run(
    name,
    platform,
    contentType,
    targetDurationSeconds,
    audience,
    tone,
    structure,
    promptInstructions,
    typeof defaultVoiceConfig === 'string' ? defaultVoiceConfig : JSON.stringify(defaultVoiceConfig || {})
  );
  return getById(result.lastInsertRowid);
}

/**
 * 更新自定义创作模板。
 * @param {number} id - 模板 ID
 * @param {Object} params - 模板字段
 * @returns {Object|undefined} 更新后的模板
 */
function update(id, { name, platform, contentType, targetDurationSeconds, audience, tone, structure, promptInstructions, defaultVoiceConfig }) {
  db.prepare(`
    UPDATE content_templates
    SET name = ?, platform = ?, content_type = ?, target_duration_seconds = ?, audience = ?,
        tone = ?, structure = ?, prompt_instructions = ?, default_voice_config = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND is_builtin = 0
  `).run(
    name,
    platform,
    contentType,
    targetDurationSeconds,
    audience,
    tone,
    structure,
    promptInstructions,
    typeof defaultVoiceConfig === 'string' ? defaultVoiceConfig : JSON.stringify(defaultVoiceConfig || {}),
    id
  );
  return getById(id);
}

/**
 * 删除自定义创作模板。
 * @param {number} id - 模板 ID
 * @returns {boolean} 是否删除成功
 */
function deleteById(id) {
  return db.prepare('DELETE FROM content_templates WHERE id = ? AND is_builtin = 0').run(id).changes > 0;
}

module.exports = { getAll, getById, create, update, deleteById };
