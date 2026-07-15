const db = require('../db');
const transcriptionResultStore = require('./transcriptionResultStore');

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function insertFacts(transcriptionId, transcript) {
  const insertSpeaker = db.prepare(`
    INSERT INTO transcription_speakers (
      transcription_id, speaker_key, display_name, sort_order, speaker_scope
    ) VALUES (?, ?, ?, ?, ?)
  `);
  const insertSegment = db.prepare(`
    INSERT INTO transcription_segments (
      transcription_id, segment_index, source_index, speaker_key, source_speaker, speaker_scope,
      speaker_resolution, chunk_index, start_seconds, end_seconds, text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertTurn = db.prepare(`
    INSERT INTO transcription_turns (
      transcription_id, turn_index, speaker_key, start_seconds, end_seconds, text, evidence_segment_indexes
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const speaker of transcript.speakers) {
    insertSpeaker.run(
      transcriptionId,
      speaker.speakerKey,
      speaker.displayName,
      speaker.sortOrder,
      speaker.speakerScope || ''
    );
  }
  for (const segment of transcript.segments) {
    insertSegment.run(
      transcriptionId,
      segment.segmentIndex,
      Number.isInteger(segment.sourceIndex) ? segment.sourceIndex : segment.segmentIndex,
      segment.speakerKey,
      segment.sourceSpeaker || '',
      segment.speakerScope || '',
      segment.speakerResolution || '',
      segment.chunkIndex,
      segment.startSeconds,
      segment.endSeconds,
      segment.text
    );
  }
  for (const turn of transcript.turns) {
    insertTurn.run(
      transcriptionId,
      turn.turnIndex,
      turn.speakerKey,
      turn.startSeconds,
      turn.endSeconds,
      turn.text,
      JSON.stringify(turn.evidenceSegmentIndexes)
    );
  }
}

/**
 * 原子保存转录主记录及其结构化事实。
 * @param {Object} params
 * @param {Object} params.record - transcription_results 创建参数
 * @param {Object|null} [params.transcript] - Speaker/Segment/Turn 聚合
 * @returns {Object} 创建后的转录主记录
 */
function create({ record, transcript = null }) {
  const run = db.transaction(() => {
    const created = transcriptionResultStore.create(record);
    if (transcript) insertFacts(created.id, transcript);
    return created;
  });
  return run();
}

/**
 * 读取内容详情工作区需要的完整 Transcript 聚合。
 * @param {number} transcriptionId - Transcript ID
 * @returns {Object|undefined} Transcript 聚合
 */
function getDetail(transcriptionId) {
  const record = transcriptionResultStore.getById(transcriptionId);
  if (!record) return undefined;
  const speakers = db.prepare(`
    SELECT * FROM transcription_speakers
    WHERE transcription_id = ? ORDER BY sort_order, id
  `).all(transcriptionId);
  const segments = db.prepare(`
    SELECT * FROM transcription_segments
    WHERE transcription_id = ? ORDER BY segment_index, id
  `).all(transcriptionId);
  const turns = db.prepare(`
    SELECT * FROM transcription_turns
    WHERE transcription_id = ? ORDER BY turn_index, id
  `).all(transcriptionId).map((turn) => ({
    ...turn,
    evidence_segment_indexes: parseJson(turn.evidence_segment_indexes, [])
  }));
  const summary = db.prepare(`
    SELECT * FROM transcription_summaries WHERE transcription_id = ?
  `).get(transcriptionId) || null;
  const summaryItems = db.prepare(`
    SELECT * FROM transcription_summary_items
    WHERE transcription_id = ? ORDER BY item_type, sort_order, id
  `).all(transcriptionId);
  return { record, speakers, segments, turns, summary, summaryItems };
}

/**
 * 更新 Transcript 总结生命周期状态。
 * @param {number} transcriptionId - Transcript ID
 * @param {Object} params
 * @param {string} params.status - 总结状态
 * @param {string} [params.error] - 失败原因
 * @param {string} [params.model] - LLM 模型
 * @returns {Object|undefined} 更新后的主记录
 */
function updateSummaryStatus(transcriptionId, { status, error = '', model = '' }) {
  db.prepare(`
    UPDATE transcription_results
    SET summary_status = ?, summary_error = ?, summary_model = ?,
        summary_updated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, error, model, transcriptionId);
  return transcriptionResultStore.getById(transcriptionId);
}

/**
 * 原子替换可重新生成的 Summary Artifact。
 * @param {number} transcriptionId - Transcript ID
 * @param {Object} params
 * @param {string} params.oneLiner - 一句话简介
 * @param {string} params.overview - 完整摘要
 * @param {string} params.model - LLM 模型
 * @param {Object[]} params.items - 章节、观点和重点片段
 * @returns {Object} 更新后的 Transcript 聚合
 */
function replaceSummary(transcriptionId, { oneLiner, overview, model, items }) {
  const run = db.transaction(() => {
    db.prepare('DELETE FROM transcription_summary_items WHERE transcription_id = ?').run(transcriptionId);
    db.prepare(`
      INSERT INTO transcription_summaries (transcription_id, one_liner, overview, model)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(transcription_id) DO UPDATE SET
        one_liner = excluded.one_liner,
        overview = excluded.overview,
        model = excluded.model,
        updated_at = CURRENT_TIMESTAMP
    `).run(transcriptionId, oneLiner, overview, model);
    const insertItem = db.prepare(`
      INSERT INTO transcription_summary_items (
        transcription_id, item_type, sort_order, speaker_key, title, content,
        evidence_start_index, evidence_end_index, start_seconds, end_seconds
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      insertItem.run(
        transcriptionId,
        item.itemType,
        item.sortOrder,
        item.speakerKey || '',
        item.title || '',
        item.content,
        item.evidenceStartIndex,
        item.evidenceEndIndex,
        item.startSeconds,
        item.endSeconds
      );
    }
    updateSummaryStatus(transcriptionId, { status: 'completed', model });
  });
  run();
  return getDetail(transcriptionId);
}

/**
 * 更新 Speaker 显示名称，不改写 Segment 的匿名 speaker key。
 * @param {number} transcriptionId - Transcript ID
 * @param {number} speakerId - Speaker ID
 * @param {string} displayName - 新显示名称
 * @returns {Object|undefined} 更新后的 Speaker
 */
function renameSpeaker(transcriptionId, speakerId, displayName) {
  const result = db.prepare(`
    UPDATE transcription_speakers
    SET display_name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND transcription_id = ?
  `).run(displayName, speakerId, transcriptionId);
  if (result.changes === 0) return undefined;
  return db.prepare('SELECT * FROM transcription_speakers WHERE id = ?').get(speakerId);
}

/**
 * 保存阅读 Turn 的用户校对文本，原始 Segment 事实保持不变。
 * @param {number} transcriptionId - Transcript ID
 * @param {number} turnId - Turn ID
 * @param {string} correctedText - 校对文本
 * @returns {{turn:Object,record:Object}|undefined} 更新后的 Turn 与聚合根状态
 */
function updateTurnCorrection(transcriptionId, turnId, correctedText) {
  const run = db.transaction(() => {
    const result = db.prepare(`
      UPDATE transcription_turns
      SET corrected_text = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND transcription_id = ?
    `).run(correctedText, turnId, transcriptionId);
    if (result.changes === 0) return undefined;
    db.prepare(`
      UPDATE transcription_results
      SET summary_status = CASE WHEN summary_status = 'completed' THEN 'stale' ELSE summary_status END,
          summary_error = '', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(transcriptionId);
    const turn = db.prepare('SELECT * FROM transcription_turns WHERE id = ?').get(turnId);
    return {
      turn: { ...turn, evidence_segment_indexes: parseJson(turn.evidence_segment_indexes, []) },
      record: transcriptionResultStore.getById(transcriptionId)
    };
  });
  return run();
}

module.exports = {
  create,
  getDetail,
  renameSpeaker,
  replaceSummary,
  updateSummaryStatus,
  updateTurnCorrection
};
