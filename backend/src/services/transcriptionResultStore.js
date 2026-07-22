// 转录结果数据访问层
const db = require('../db');

function parseUsage(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function serializeUsage(usage) {
  return usage ? JSON.stringify(usage) : null;
}

function parseJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalize(row) {
  if (!row) return undefined;
  return {
    ...row,
    usage: parseUsage(row.usage),
    asr_diagnostics: parseJson(row.asr_diagnostics, {}),
    asr_warnings: parseJson(row.asr_warnings, []),
    guest_names: parseJson(row.guest_names, []),
    topic_tags: parseJson(row.topic_tags, []),
    file_size_bytes: Number(row.file_size_bytes || 0),
    audio_duration_seconds: Number(row.audio_duration_seconds || 0),
    processing_seconds: Number(row.processing_seconds || 0)
  };
}

function normalizeStats(row) {
  return {
    total_count: Number(row?.total_count || 0),
    total_file_size_bytes: Number(row?.total_file_size_bytes || 0),
    total_audio_duration_seconds: Number(row?.total_audio_duration_seconds || 0),
    total_text_chars: Number(row?.total_text_chars || 0),
    total_processing_seconds: Number(row?.total_processing_seconds || 0)
  };
}

const REFERENCED_RESULT_DELETE_MESSAGE = '该转录中的观点已被内容项目引用，请先从内容项目移除观点后再删除转录结果';

class TranscriptionResultInUseError extends Error {
  constructor() {
    super(REFERENCED_RESULT_DELETE_MESSAGE);
    this.name = 'TranscriptionResultInUseError';
    this.code = 'TRANSCRIPTION_RESULT_IN_USE';
  }
}

/**
 * 创建转录结果记录
 * @param {Object} params
 * @param {string} params.fileName - 文件名
 * @param {string} [params.relativePath] - 批量转录中的相对路径
 * @param {string} params.text - 原始转录文本
 * @param {string} [params.formattedText] - AI 排版文本
 * @param {string} [params.language] - 转录语言
 * @param {string} [params.provider] - ASR provider
 * @param {string} [params.engine] - WSL ASR 引擎
 * @param {string} [params.model] - ASR 模型
 * @param {string} [params.context] - WSL/Qwen context
 * @param {Object|null} [params.usage] - ASR usage
 * @param {string} [params.taskId] - SSE 任务 ID
 * @param {number} [params.fileSizeBytes] - 上传文件字节数
 * @param {number} [params.audioDurationSeconds] - 媒体时长（秒）
 * @param {number} [params.processingSeconds] - 转录处理耗时（秒）
 * @returns {Object} 创建后的转录结果
 */
function create({
  fileName,
  relativePath,
  text,
  formattedText,
  language,
  provider,
  engine,
  model,
  context,
  usage,
  taskId,
  fileSizeBytes,
  audioDurationSeconds,
  processingSeconds,
  contentMode,
  structureStatus,
  summaryStatus,
  summaryError,
  speakerScope,
  diarizationStatus,
  speakerCount,
  diarizationConflicts,
  asrDiagnostics,
  asrWarnings
}) {
  const result = db.prepare(`
    INSERT INTO transcription_results (
      file_name, relative_path, text, formatted_text, language, provider, engine, model, context, usage, task_id,
      file_size_bytes, audio_duration_seconds, processing_seconds, content_mode, structure_status,
      summary_status, summary_error, speaker_scope, diarization_status, speaker_count,
      diarization_conflicts, asr_diagnostics, asr_warnings, episode_title
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fileName,
    relativePath || fileName,
    text,
    formattedText || '',
    language || 'auto',
    provider || '',
    engine || '',
    model || '',
    context || '',
    serializeUsage(usage),
    taskId || '',
    Number(fileSizeBytes || 0),
    Number(audioDurationSeconds || 0),
    Number(processingSeconds || 0),
    contentMode || 'standard',
    structureStatus || 'unavailable',
    summaryStatus || 'not_started',
    summaryError || '',
    speakerScope || '',
    diarizationStatus || '',
    Number(speakerCount || 0),
    Number(diarizationConflicts || 0),
    JSON.stringify(asrDiagnostics || {}),
    JSON.stringify(Array.isArray(asrWarnings) ? asrWarnings : []),
    fileName
  );
  return getById(result.lastInsertRowid);
}

/**
 * 更新播客研究元数据。
 * @param {number} id - 转录结果 ID
 * @param {Object} metadata - 已校验的元数据
 * @returns {Object|undefined} 更新后的记录
 */
function updateMetadata(id, metadata) {
  const result = db.prepare(`
    UPDATE transcription_results
    SET podcast_name = ?, episode_title = ?, guest_names = ?, source_url = ?,
        published_at = ?, topic_tags = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    metadata.podcastName,
    metadata.episodeTitle,
    JSON.stringify(metadata.guestNames),
    metadata.sourceUrl,
    metadata.publishedAt,
    JSON.stringify(metadata.topicTags),
    id
  );
  return result.changes > 0 ? getById(id) : undefined;
}

/**
 * 根据 ID 获取转录结果
 * @param {number} id - 转录结果 ID
 * @returns {Object|undefined} 转录结果
 */
function getById(id) {
  return normalize(db.prepare('SELECT * FROM transcription_results WHERE id = ?').get(id));
}

/**
 * 获取最近的转录结果
 * @param {Object} params
 * @param {number} params.limit - 返回数量
 * @returns {Object[]} 转录结果列表
 */
function getRecent({ limit, offset = 0 }) {
  return db.prepare('SELECT * FROM transcription_results ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?')
    .all(limit, offset)
    .map(normalize);
}

/**
 * 统计已保存转录结果总数（分页 total）
 * @returns {number} 结果总数
 */
function countAll() {
  return db.prepare('SELECT COUNT(*) AS count FROM transcription_results').get().count;
}

/**
 * 获取转录统计总览
 * @returns {Object} 统计总览
 */
function getStats() {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total_count,
      COALESCE(SUM(file_size_bytes), 0) AS total_file_size_bytes,
      COALESCE(SUM(audio_duration_seconds), 0) AS total_audio_duration_seconds,
      COALESCE(SUM(LENGTH(COALESCE(NULLIF(formatted_text, ''), text))), 0) AS total_text_chars,
      COALESCE(SUM(processing_seconds), 0) AS total_processing_seconds
    FROM transcription_results
  `).get();
  return normalizeStats(row);
}

/**
 * 更新转录原文与 AI 排版文本
 * @param {number} id - 转录结果 ID
 * @param {Object} params
 * @param {string} params.text - 当前原文
 * @param {string} params.formattedText - AI 排版文本
 * @returns {Object|undefined} 更新后的转录结果
 */
function updateTextAndFormatted(id, { text, formattedText }) {
  db.prepare(`
    UPDATE transcription_results
    SET text = ?, formatted_text = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(text, formattedText, id);
  return getById(id);
}

const removeTransaction = db.transaction((id) => {
  const referencedClaim = db.prepare(`
    SELECT c.id
    FROM transcription_claims c
    INNER JOIN content_project_claims pc ON pc.claim_id = c.id
    WHERE c.transcription_id = ?
    LIMIT 1
  `).get(id);
  if (referencedClaim) throw new TranscriptionResultInUseError();

  const result = db.prepare('DELETE FROM transcription_results WHERE id = ?').run(id);
  return result.changes > 0;
});

/**
 * 删除转录结果。检查项目引用与删除在同一事务内完成，避免级联误删研究成果。
 * @param {number} id - 转录结果 ID
 * @returns {boolean} 是否删除成功
 * @throws {TranscriptionResultInUseError} 观点已被内容项目引用时阻止删除
 */
function remove(id) {
  return removeTransaction(id);
}

module.exports = {
  REFERENCED_RESULT_DELETE_MESSAGE,
  TranscriptionResultInUseError,
  create,
  countAll,
  getById,
  getRecent,
  getStats,
  updateMetadata,
  updateTextAndFormatted,
  remove
};
