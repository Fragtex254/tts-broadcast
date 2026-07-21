// 分段记录数据访问层
const db = require('../db');

const SEGMENT_COLUMNS = `
  id, broadcast_id, "index", text, audio_path, status, style_tag,
  playback_rate, error_message, created_at, updated_at
`;

/**
 * 批量插入 segments
 * @param {number} broadcastId - 关联的播报 ID
 * @param {string[]} texts - 分段文本数组
 */
function createMany(broadcastId, texts) {
  const insertStmt = db.prepare(
    'INSERT INTO segments (broadcast_id, "index", text, status, playback_rate, error_message) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertStmt.run(item.broadcastId, item.index, item.text, 'pending', 1, '');
    }
  });
  insertMany(texts.map((text, index) => ({ broadcastId, index, text })));
}

/**
 * 用指定顺序整体替换播报 segments；未变化的已有段保留音频与状态。
 * @param {number} broadcastId - 播报 ID
 * @param {Array<{id?:number,text:string,styleTag:string}>} items - 新段落列表
 */
function replaceAll(broadcastId, items) {
  const existing = getByBroadcastId(broadcastId);
  const existingById = new Map(existing.map((segment) => [segment.id, segment]));
  const keptIds = new Set();
  const insertStmt = db.prepare(
    'INSERT INTO segments (broadcast_id, "index", text, status, style_tag, playback_rate, error_message) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const updateChangedStmt = db.prepare(
    'UPDATE segments SET "index" = ?, text = ?, style_tag = ?, status = ?, audio_path = NULL, error_message = ?, generation_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND broadcast_id = ?'
  );
  const updateIndexStmt = db.prepare(
    `UPDATE segments
     SET status = CASE WHEN status = 'generating' AND "index" <> ? THEN 'pending' ELSE status END,
         generation_token = CASE WHEN status = 'generating' AND "index" <> ? THEN NULL ELSE generation_token END,
         "index" = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND broadcast_id = ?`
  );
  const deleteStmt = db.prepare('DELETE FROM segments WHERE id = ? AND broadcast_id = ?');

  const run = db.transaction((list) => {
    list.forEach((item, index) => {
      const existingSegment = item.id ? existingById.get(item.id) : null;
      const styleTag = item.styleTag || '';
      if (!existingSegment) {
        insertStmt.run(broadcastId, index, item.text, 'pending', styleTag, 1, '');
        return;
      }

      keptIds.add(item.id);
      const hasChanged = existingSegment.text !== item.text || existingSegment.style_tag !== styleTag;
      if (hasChanged) {
        updateChangedStmt.run(index, item.text, styleTag, 'pending', '', item.id, broadcastId);
      } else if (existingSegment.index !== index) {
        updateIndexStmt.run(index, index, index, item.id, broadcastId);
      }
    });

    for (const segment of existing) {
      if (!keptIds.has(segment.id)) {
        deleteStmt.run(segment.id, broadcastId);
      }
    }
  });

  run(items);
}

/**
 * 获取播报的所有 segments（按 index 排序）
 * @param {number} broadcastId - 播报 ID
 * @returns {Array} segments 列表
 */
function getByBroadcastId(broadcastId) {
  return db.prepare(`SELECT ${SEGMENT_COLUMNS} FROM segments WHERE broadcast_id = ? ORDER BY "index"`).all(broadcastId);
}

/**
 * 根据 ID 和 broadcastId 获取单条 segment
 * @param {number} segId - segment ID
 * @param {number} broadcastId - 播报 ID
 * @returns {Object|undefined} segment 记录
 */
function getByIdAndBroadcastId(segId, broadcastId) {
  return db.prepare(`SELECT ${SEGMENT_COLUMNS} FROM segments WHERE id = ? AND broadcast_id = ?`).get(segId, broadcastId);
}

/**
 * 获取播报下待处理（pending/failed/generating）的 segments。
 * generating 也纳入可恢复队列，避免请求中断后段落永久卡在生成中。
 * @param {number} broadcastId - 播报 ID
 * @returns {Array} pending 和 failed 状态的 segments
 */
function getPendingByBroadcastId(broadcastId) {
  return db.prepare(
    `SELECT ${SEGMENT_COLUMNS}
     FROM segments
     WHERE broadcast_id = ? AND status IN ('pending', 'failed', 'generating')
     ORDER BY "index"`
  ).all(broadcastId);
}

/**
 * 更新 segment 状态和音频路径
 * @param {number} segId - segment ID
 * @param {string} status - 新状态
 * @param {string} [audioPath] - 音频文件路径
 * @param {string} [errorMessage] - 失败原因
 */
function updateStatus(segId, status, audioPath, errorMessage = '') {
  const normalizedError = status === 'failed' ? String(errorMessage || '').slice(0, 500) : '';
  if (audioPath) {
    db.prepare('UPDATE segments SET status = ?, audio_path = ?, error_message = ?, generation_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, audioPath, normalizedError, segId);
  } else {
    db.prepare('UPDATE segments SET status = ?, error_message = ?, generation_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(status, normalizedError, segId);
  }
}

/**
 * 以启动时的 segment 快照原子标记生成开始。
 * @param {Object} snapshot - 含 id、broadcast_id、text、style_tag、index、status 的启动快照
 * @param {string} generationToken - 本次生成唯一令牌
 * @returns {boolean} 快照仍匹配且成功写入令牌时为 true
 */
function tryStartGeneration(snapshot, generationToken) {
  if (typeof generationToken !== 'string' || generationToken.length === 0 || generationToken.length > 128) {
    return false;
  }
  const result = db.prepare(`
    UPDATE segments
    SET status = 'generating', generation_token = ?, error_message = '', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND broadcast_id = ?
      AND text = ?
      AND COALESCE(style_tag, '') = ?
      AND "index" = ?
      AND status = ?
  `).run(
    generationToken,
    snapshot.id,
    snapshot.broadcast_id,
    snapshot.text,
    snapshot.style_tag || '',
    snapshot.index,
    snapshot.status
  );
  return result.changes === 1;
}

/**
 * 以启动时的 segment 快照原子收口生成结果，只允许当前 generating 任务写回。
 * @param {Object} params
 * @param {Object} params.snapshot - 含 id、broadcast_id、text、style_tag、index 的启动快照
 * @param {string} params.generationToken - tryStartGeneration 写入的唯一令牌
 * @param {'generated'|'failed'} params.status - 最终状态
 * @param {string|null} [params.audioPath] - 本次生成的唯一音频路径
 * @param {string} [params.errorMessage] - 失败原因
 * @returns {{applied:boolean,replacedAudioPath:string|null}} CAS 结果及被替换的旧音频路径
 */
function tryFinishGeneration({ snapshot, generationToken, status, audioPath = null, errorMessage = '' }) {
  if (
    typeof generationToken !== 'string'
    || generationToken.length === 0
    || generationToken.length > 128
    || !['generated', 'failed'].includes(status)
  ) {
    return { applied: false, replacedAudioPath: null };
  }
  const normalizedError = status === 'failed' ? String(errorMessage || '').slice(0, 500) : '';
  const finish = db.transaction(() => {
    const current = db.prepare(`
      SELECT audio_path
      FROM segments
      WHERE id = ?
        AND broadcast_id = ?
        AND text = ?
        AND COALESCE(style_tag, '') = ?
        AND "index" = ?
        AND status = 'generating'
        AND generation_token = ?
    `).get(
      snapshot.id,
      snapshot.broadcast_id,
      snapshot.text,
      snapshot.style_tag || '',
      snapshot.index,
      generationToken
    );
    if (!current) {
      return { applied: false, replacedAudioPath: null };
    }

    const result = audioPath
      ? db.prepare(`
        UPDATE segments
        SET status = ?, audio_path = ?, error_message = ?, generation_token = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND broadcast_id = ?
          AND text = ?
          AND COALESCE(style_tag, '') = ?
          AND "index" = ?
          AND status = 'generating'
          AND generation_token = ?
      `).run(
        status,
        audioPath,
        normalizedError,
        snapshot.id,
        snapshot.broadcast_id,
        snapshot.text,
        snapshot.style_tag || '',
        snapshot.index,
        generationToken
      )
      : db.prepare(`
        UPDATE segments
        SET status = ?, error_message = ?, generation_token = NULL, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND broadcast_id = ?
          AND text = ?
          AND COALESCE(style_tag, '') = ?
          AND "index" = ?
          AND status = 'generating'
          AND generation_token = ?
      `).run(
        status,
        normalizedError,
        snapshot.id,
        snapshot.broadcast_id,
        snapshot.text,
        snapshot.style_tag || '',
        snapshot.index,
        generationToken
      );

    if (result.changes !== 1) {
      return { applied: false, replacedAudioPath: null };
    }
    return { applied: true, replacedAudioPath: current.audio_path || null };
  });

  return finish();
}

/**
 * 更新 segment 文本，并重置状态为 pending
 * @param {number} segId - segment ID
 * @param {string} text - 新文本
 */
function updateText(segId, text) {
  db.prepare(
    "UPDATE segments SET text = ?, status = 'pending', audio_path = NULL, error_message = '', generation_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(text, segId);
}

/**
 * 更新 segment 的整体风格标签，并重置状态为 pending、清空音频
 * @param {number} segId - segment ID
 * @param {string} styleTag - 已清洗的风格标签（空串=无）
 */
function updateStyleTag(segId, styleTag) {
  db.prepare(
    "UPDATE segments SET style_tag = ?, status = 'pending', audio_path = NULL, error_message = '', generation_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(styleTag, segId);
}

/**
 * 批量更新风格标签（仅对 tag 实际变化的段重置状态/音频）
 * @param {number} broadcastId - 播报 ID
 * @param {Array<{id:number, styleTag:string}>} items
 */
function bulkUpdateStyleTags(broadcastId, items) {
  const getStmt = db.prepare('SELECT style_tag FROM segments WHERE id = ? AND broadcast_id = ?');
  const updateStmt = db.prepare(
    "UPDATE segments SET style_tag = ?, status = 'pending', audio_path = NULL, error_message = '', generation_token = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND broadcast_id = ?"
  );
  const run = db.transaction((list) => {
    for (const { id, styleTag } of list) {
      const current = getStmt.get(id, broadcastId);
      if (!current) continue;
      const next = styleTag || '';
      if (current.style_tag !== next) {
        updateStmt.run(next, id, broadcastId);
      }
    }
  });
  run(items);
}

/**
 * 更新单个 segment 的播放/导出倍速，不重置已生成的 TTS 原始音频。
 * @param {number} segId - segment ID
 * @param {number} playbackRate - 播放/导出倍速
 */
function updatePlaybackRate(segId, playbackRate) {
  db.prepare('UPDATE segments SET playback_rate = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(playbackRate, segId);
}

/**
 * 批量更新播报下所有 segments 的播放/导出倍速。
 * @param {number} broadcastId - 播报 ID
 * @param {number} playbackRate - 播放/导出倍速
 */
function bulkUpdatePlaybackRate(broadcastId, playbackRate) {
  db.prepare('UPDATE segments SET playback_rate = ?, updated_at = CURRENT_TIMESTAMP WHERE broadcast_id = ?')
    .run(playbackRate, broadcastId);
}

/**
 * 按新 ID 顺序重排 segments 的 index
 * @param {number} broadcastId - 播报 ID
 * @param {number[]} segmentIds - 新排序后的 segment ID 数组
 */
function reorder(broadcastId, segmentIds) {
  const updateStmt = db.prepare(
    `UPDATE segments
     SET status = CASE WHEN status = 'generating' AND "index" <> ? THEN 'pending' ELSE status END,
         generation_token = CASE WHEN status = 'generating' AND "index" <> ? THEN NULL ELSE generation_token END,
         "index" = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND broadcast_id = ?`
  );
  const doReorder = db.transaction((ids) => {
    for (let i = 0; i < ids.length; i++) {
      updateStmt.run(i, i, i, ids[i], broadcastId);
    }
  });
  doReorder(segmentIds);
}

/**
 * 删除单条 segment
 * @param {number} segId - segment ID
 */
function deleteById(segId) {
  db.prepare('DELETE FROM segments WHERE id = ?').run(segId);
}

/**
 * 删除播报的所有 segments
 * @param {number} broadcastId - 播报 ID
 */
function deleteByBroadcastId(broadcastId) {
  db.prepare('DELETE FROM segments WHERE broadcast_id = ?').run(broadcastId);
}

/**
 * 删除 segment 并重索引后续 segments。
 * 音频路径以 segment ID + 生成 token 稳定命名，不再随序号重命名。
 * @param {number} broadcastId - 播报 ID
 * @param {number} segId - 要删除的 segment ID
 */
function deleteAndReindex(broadcastId, segId) {
  const segment = db.prepare('SELECT * FROM segments WHERE id = ? AND broadcast_id = ?').get(segId, broadcastId);
  if (!segment) return;

  const deletedIndex = segment.index;

  const doDeleteAndReindex = db.transaction(() => {
    db.prepare('DELETE FROM segments WHERE id = ?').run(segId);

    const laterSegments = db.prepare(
      'SELECT * FROM segments WHERE broadcast_id = ? AND "index" > ? ORDER BY "index"'
    ).all(broadcastId, deletedIndex);

    const reindexStmt = db.prepare(`
      UPDATE segments
      SET "index" = ?,
          status = CASE WHEN status = 'generating' THEN 'pending' ELSE status END,
          generation_token = CASE WHEN status = 'generating' THEN NULL ELSE generation_token END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND broadcast_id = ?
    `);
    for (const seg of laterSegments) {
      reindexStmt.run(seg.index - 1, seg.id, broadcastId);
    }
  });

  doDeleteAndReindex();
}

/**
 * 统计指定 IDs 中实际存在的 segment 数量
 * @param {number} broadcastId - 播报 ID
 * @param {number[]} ids - segment ID 数组
 * @returns {number} 匹配数量
 */
function countByIds(broadcastId, ids) {
  return db.prepare(
    `SELECT COUNT(*) as count FROM segments WHERE broadcast_id = ? AND id IN (${ids.map(() => '?').join(',')})`
  ).get(broadcastId, ...ids).count;
}

module.exports = {
  createMany,
  replaceAll,
  getByBroadcastId,
  getByIdAndBroadcastId,
  getPendingByBroadcastId,
  updateStatus,
  tryStartGeneration,
  tryFinishGeneration,
  updateText,
  updateStyleTag,
  bulkUpdateStyleTags,
  updatePlaybackRate,
  bulkUpdatePlaybackRate,
  reorder,
  deleteById,
  deleteByBroadcastId,
  deleteAndReindex,
  countByIds
};
