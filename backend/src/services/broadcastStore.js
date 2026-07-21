// 广播记录数据访问层
const db = require('../db');

function toBroadcastDto(row) {
  if (!row) return undefined;
  return {
    ...row,
    // artifact_revision_id 是兼容数据库字段；该别名明确表达“创建 Render 时的来源版本”。
    source_artifact_revision_id: row.artifact_revision_id ?? null,
  };
}

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
 * @param {number|null} [params.artifactRevisionId] - 创建 Render 时的来源口播稿 Revision ID
 * @returns {Object} 创建的播报记录
 */
function create({ title, content, audioPath, voiceType, voiceConfig, sourceItems, status, mode, artifactRevisionId }) {
  const result = db.prepare(`
    INSERT INTO broadcasts (
      title, content, audio_path, voice_type, voice_config, source_items, status, mode, artifact_revision_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title,
    content,
    audioPath || null,
    voiceType || null,
    typeof voiceConfig === 'string' ? voiceConfig : JSON.stringify(voiceConfig || {}),
    sourceItems ? (typeof sourceItems === 'string' ? sourceItems : JSON.stringify(sourceItems)) : null,
    status || 'pending',
    mode || 'whole',
    artifactRevisionId ?? null
  );
  return getById(Number(result.lastInsertRowid));
}

/**
 * 根据 ID 获取播报记录
 * @param {number} id - 播报 ID
 * @returns {Object|undefined} 播报记录，不存在时返回 undefined
 */
function getById(id) {
  return toBroadcastDto(db.prepare('SELECT * FROM broadcasts WHERE id = ?').get(id));
}

/**
 * 获取已保存播报历史列表（按创建时间倒序）
 * @param {Object} params
 * @param {number} params.limit - 每页数量
 * @param {number} params.offset - 偏移量
 * @returns {Array} 播报记录列表
 */
function getHistory({ limit, offset }) {
  return db.prepare('SELECT * FROM broadcasts WHERE saved = 1 ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset)
    .map(toBroadcastDto);
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
 * 统计可由缓存 FIFO 淘汰的未保存 Render。
 * pending 任务仍可能在等待 TTS，不能作为淘汰候选。
 * @returns {number} 已生成且未保存的 Render 数量
 */
function countEvictableUnsaved() {
  return db.prepare("SELECT COUNT(*) as count FROM broadcasts WHERE saved = 0 AND status = 'generated'")
    .get().count;
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
 * 获取最旧的可淘汰未保存 Render，不包含 pending 任务。
 * @param {number} n - 数量
 * @returns {Array} 已生成且未保存的 Render 列表
 */
function getOldestEvictableUnsaved(n) {
  return db.prepare(`
    SELECT id, title, audio_path
    FROM broadcasts
    WHERE saved = 0 AND status = 'generated'
    ORDER BY created_at ASC, id ASC
    LIMIT ?
  `).all(n);
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
 * 将 pending 整篇 Render 原子收口为已生成状态。
 * @param {Object} params
 * @param {number} params.id - Broadcast ID
 * @param {string} params.audioPath - 已写入的音频路径
 * @returns {Object|undefined} 更新后的 Render；记录已不存在时返回 undefined
 */
function completeWholeGeneration({ id, audioPath }) {
  const result = db.prepare(`
    UPDATE broadcasts
    SET audio_path = ?, status = 'generated', updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND mode = 'whole' AND status = 'pending' AND audio_path IS NULL
  `).run(audioPath, id);
  return result.changes > 0 ? getById(id) : undefined;
}

/**
 * 回滚尚未收口的整篇 Render，避免误删已完成或已被其他流程接管的记录。
 * @param {number} id - Broadcast ID
 * @returns {boolean} 是否删除了 pending Render
 */
function deletePendingWholeGeneration(id) {
  const result = db.prepare(`
    DELETE FROM broadcasts
    WHERE id = ? AND mode = 'whole' AND status = 'pending' AND audio_path IS NULL
  `).run(id);
  return result.changes > 0;
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
  const updated = getById(id);
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
  return toBroadcastDto(record);
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
  countEvictableUnsaved,
  countSaved,
  getOldestUnsaved,
  getOldestEvictableUnsaved,
  getOldestSaved,
  updateAudioPath,
  completeWholeGeneration,
  deletePendingWholeGeneration,
  updateVoiceConfig,
  toggleSaved,
  deleteById,
  batchDeleteByIds,
  clearAudioAndSetMode,
  clearAudioPath,
  updateStatus
};
