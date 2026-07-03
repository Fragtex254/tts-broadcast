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

function normalize(row) {
  if (!row) return undefined;
  return {
    ...row,
    usage: parseUsage(row.usage),
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

/**
 * 创建转录结果记录
 * @param {Object} params
 * @param {string} params.fileName - 文件名
 * @param {string} [params.relativePath] - 批量转录中的相对路径
 * @param {string} params.text - 原始转录文本
 * @param {string} [params.formattedText] - AI 排版文本
 * @param {string} [params.language] - 转录语言
 * @param {string} [params.provider] - ASR provider
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
  model,
  context,
  usage,
  taskId,
  fileSizeBytes,
  audioDurationSeconds,
  processingSeconds
}) {
  const result = db.prepare(`
    INSERT INTO transcription_results (
      file_name, relative_path, text, formatted_text, language, provider, model, context, usage, task_id,
      file_size_bytes, audio_duration_seconds, processing_seconds
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    fileName,
    relativePath || fileName,
    text,
    formattedText || '',
    language || 'auto',
    provider || '',
    model || '',
    context || '',
    serializeUsage(usage),
    taskId || '',
    Number(fileSizeBytes || 0),
    Number(audioDurationSeconds || 0),
    Number(processingSeconds || 0)
  );
  return getById(result.lastInsertRowid);
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
function getRecent({ limit }) {
  return db.prepare('SELECT * FROM transcription_results ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(limit)
    .map(normalize);
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

/**
 * 删除转录结果
 * @param {number} id - 转录结果 ID
 * @returns {boolean} 是否删除成功
 */
function remove(id) {
  const result = db.prepare('DELETE FROM transcription_results WHERE id = ?').run(id);
  return result.changes > 0;
}

module.exports = {
  create,
  getById,
  getRecent,
  getStats,
  updateTextAndFormatted,
  remove
};
