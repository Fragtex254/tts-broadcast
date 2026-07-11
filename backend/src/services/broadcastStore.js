// 广播记录数据访问层
const db = require('../db');

/**
 * 创建播报记录
 * @param {Object} params
 * @param {string} params.title - 播报标题
 * @param {string} params.content - 播报稿件正文
 * @param {string|null} [params.audioPath] - 音频文件路径
 * @param {string} [params.voiceType] - 音色类型
 * @param {string|Object} [params.voiceConfig] - 音色配置
 * @param {string|Array|null} [params.sourceItems] - 来源资讯列表
 * @param {string} [params.status='pending'] - 播报状态
 * @param {string} [params.mode='whole'] - 播报模式（whole/segmented）
 * @param {number|null} [params.templateId] - 创作模板 ID
 * @param {Object|string|null} [params.templateSnapshot] - 创建时模板快照
 * @returns {Object} 创建的播报记录
 */
function create({ title, content, audioPath, voiceType, voiceConfig, sourceItems, status, mode, templateId, templateSnapshot }) {
  const result = db.prepare(`
    INSERT INTO broadcasts (
      title, content, audio_path, voice_type, voice_config, source_items, status, mode,
      template_id, template_snapshot
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title,
    content,
    audioPath || null,
    voiceType || null,
    typeof voiceConfig === 'string' ? voiceConfig : JSON.stringify(voiceConfig || {}),
    sourceItems ? (typeof sourceItems === 'string' ? sourceItems : JSON.stringify(sourceItems)) : null,
    status || 'pending',
    mode || 'whole',
    templateId || null,
    typeof templateSnapshot === 'string' ? templateSnapshot : JSON.stringify(templateSnapshot || {})
  );
  return db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(result.lastInsertRowid);
}

/**
 * 保存播报的发布信息。
 * @param {number} id - 播报 ID
 * @param {Object|string} publishMetadata - 发布信息
 * @returns {Object|undefined} 更新后的播报
 */
function updatePublishMetadata(id, publishMetadata) {
  const value = typeof publishMetadata === 'string' ? publishMetadata : JSON.stringify(publishMetadata || {});
  db.prepare('UPDATE broadcasts SET publish_metadata = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(value, id);
  return getById(id);
}

/**
 * 根据 ID 获取播报记录
 * @param {number} id - 播报 ID
 * @returns {Object|undefined} 播报记录，不存在时返回 undefined
 */
function getById(id) {
  return db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
}

/**
 * 获取已保存播报历史列表（按创建时间倒序）
 * @param {Object} params
 * @param {number} params.limit - 每页数量
 * @param {number} params.offset - 偏移量
 * @returns {Array} 播报记录列表
 */
function getHistory({ limit, offset }) {
  return db.prepare('SELECT * FROM broadcasts WHERE saved = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
}

/**
 * 获取播报总数
 * @returns {number} 总数
 */
function countAll() {
  return db.prepare('SELECT COUNT(*) as count FROM broadcasts').get().count;
}

/**
 * 获取未保存播报数量
 * @returns {number} 未保存数量
 */
function countUnsaved() {
  return db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE saved = 0').get().count;
}

/**
 * 获取已保存播报数量
 * @returns {number} 已保存数量
 */
function countSaved() {
  return db.prepare('SELECT COUNT(*) as count FROM broadcasts WHERE saved = 1').get().count;
}

/**
 * 获取最旧的 N 条未保存播报（用于自动清理）
 * @param {number} n - 数量
 * @returns {Array} 播报记录列表（含 id 和 audio_path）
 */
function getOldestUnsaved(n) {
  return db.prepare(
    'SELECT id, title, audio_path FROM broadcasts WHERE saved = 0 ORDER BY created_at ASC, id ASC LIMIT ?'
  ).all(n);
}

/**
 * 获取最旧的 N 条已保存播报（用于上限淘汰）
 * @param {number} n - 数量
 * @returns {Array} 播报记录列表（含 id 和 audio_path）
 */
function getOldestSaved(n) {
  return db.prepare(
    'SELECT id, title, audio_path FROM broadcasts WHERE saved = 1 ORDER BY created_at ASC, id ASC LIMIT ?'
  ).all(n);
}

/**
 * 更新音频路径
 * @param {number} id - 播报 ID
 * @param {string} audioPath - 新的音频路径
 */
function updateAudioPath(id, audioPath) {
  db.prepare('UPDATE broadcasts SET audio_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(audioPath, id);
}

/**
 * 更新音色配置
 * @param {number} id - 播报 ID
 * @param {Object} params
 * @param {string} [params.voiceType] - 音色类型
 * @param {string} [params.voiceConfig] - 音色配置 JSON
 */
function updateVoiceConfig(id, { voiceType, voiceConfig }) {
  db.prepare('UPDATE broadcasts SET voice_type = ?, voice_config = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(voiceType || null, voiceConfig, id);
}

/**
 * 切换保存状态
 * @param {number} id - 播报 ID
 * @returns {Object|null} { newSaved, broadcast } 或不存在时返回 null
 */
function toggleSaved(id) {
  const broadcast = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
  if (!broadcast) return null;
  const newSaved = broadcast.saved ? 0 : 1;
  db.prepare('UPDATE broadcasts SET saved = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newSaved, id);
  const updated = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
  return { newSaved, broadcast: updated };
}

/**
 * 删除播报记录（含级联删除 segments）
 * @param {number} id - 播报 ID
 * @returns {Object|undefined} 被删除的记录，不存在时返回 undefined
 */
function deleteById(id) {
  const record = db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id);
  if (!record) return undefined;
  db.prepare('DELETE FROM broadcasts WHERE id = ?').run(id);
  return record;
}

/**
 * 批量删除播报记录（含级联删除 segments）
 * @param {number[]} ids - 播报 ID 数组
 * @returns {Object} { deleted: number, failed: number }
 */
function batchDeleteByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { deleted: 0, failed: 0 };
  }

  let deleted = 0;
  let failed = 0;

  const deleteTransaction = db.transaction((idList) => {
    for (const id of idList) {
      const record = db.prepare('SELECT id FROM broadcasts WHERE id = ?').get(id);
      if (record) {
        db.prepare('DELETE FROM broadcasts WHERE id = ?').run(id);
        deleted++;
      } else {
        failed++;
      }
    }
  });

  deleteTransaction(ids);
  return { deleted, failed };
}

/**
 * 清空音频路径并设置播报模式（用于重新生成）
 * @param {number} id - 播报 ID
 * @param {string} mode - 新的播报模式
 */
function clearAudioAndSetMode(id, mode) {
  db.prepare("UPDATE broadcasts SET mode = ?, audio_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(mode, id);
}

/**
 * 清空播报合并音频路径，保留当前模式。
 * @param {number} id - 播报 ID
 */
function clearAudioPath(id) {
  db.prepare('UPDATE broadcasts SET audio_path = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(id);
}

/**
 * 更新播报状态
 * @param {number} id - 播报 ID
 * @param {string} status - 新状态
 */
function updateStatus(id, status) {
  db.prepare('UPDATE broadcasts SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, id);
}

module.exports = {
  create,
  getById,
  getHistory,
  countAll,
  countUnsaved,
  countSaved,
  getOldestUnsaved,
  getOldestSaved,
  updateAudioPath,
  updateVoiceConfig,
  updatePublishMetadata,
  toggleSaved,
  deleteById,
  batchDeleteByIds,
  clearAudioAndSetMode,
  clearAudioPath,
  updateStatus
};
