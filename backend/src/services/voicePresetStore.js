// 音色预设数据访问层
const db = require('../db');

/**
 * 获取所有音色预设
 * @returns {Array} 音色预设列表
 */
function getAll() {
  return db.prepare('SELECT * FROM voice_presets ORDER BY created_at DESC').all();
}

/**
 * 根据 ID 获取音色预设
 * @param {number} id - 预设 ID
 * @returns {Object|undefined} 音色预设
 */
function getById(id) {
  return db.prepare('SELECT * FROM voice_presets WHERE id = ?').get(id);
}

/**
 * 获取预设总数
 * @returns {number} 预设数量
 */
function countAll() {
  return db.prepare('SELECT COUNT(*) as count FROM voice_presets').get().count;
}

/**
 * 创建音色预设
 * @param {Object} params
 * @param {string} params.type - 预设类型
 * @param {string} params.name - 预设名称
 * @param {string} [params.stylePrompt] - 风格提示词
 * @param {string|null} [params.trialAudioPath] - 试听音频路径
 * @param {string|null} [params.originalAudioPath] - 原始参考音频路径
 * @param {string|null} [params.designPrompt] - 音色设计提示词
 * @returns {Object} 创建后的音色预设
 */
function create({ type, name, stylePrompt, trialAudioPath, originalAudioPath, designPrompt }) {
  const result = db.prepare(`
    INSERT INTO voice_presets (type, name, style_prompt, trial_audio_path, original_audio_path, design_prompt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    type,
    name,
    stylePrompt || '',
    trialAudioPath || null,
    originalAudioPath || null,
    designPrompt || null
  );

  return getById(result.lastInsertRowid);
}

/**
 * 更新预设音频路径
 * @param {number} id - 预设 ID
 * @param {Object} params
 * @param {string|null} [params.trialAudioPath] - 试听音频路径
 * @param {string|null} [params.originalAudioPath] - 原始参考音频路径
 * @returns {Object|undefined} 更新后的音色预设
 */
function updateAudioPaths(id, { trialAudioPath, originalAudioPath }) {
  const existing = getById(id);
  if (!existing) return undefined;

  db.prepare(`
    UPDATE voice_presets
    SET trial_audio_path = ?, original_audio_path = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    trialAudioPath ?? existing.trial_audio_path,
    originalAudioPath ?? existing.original_audio_path,
    id
  );

  return getById(id);
}

/**
 * 删除音色预设
 * @param {number} id - 预设 ID
 * @returns {Object|undefined} 被删除的音色预设
 */
function deleteById(id) {
  const preset = getById(id);
  if (!preset) return undefined;
  db.prepare('DELETE FROM voice_presets WHERE id = ?').run(id);
  return preset;
}

module.exports = {
  getAll,
  getById,
  countAll,
  create,
  updateAudioPaths,
  deleteById,
};
