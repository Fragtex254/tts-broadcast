// backend/src/utils/validation.js
const path = require('path');
const fs = require('fs');

const audioDir = path.join(__dirname, '../../audio');

/**
 * 校验 URL 路径中的 ID 参数
 * @param {string} idStr - 原始字符串
 * @param {string} [label='ID'] - 用于错误消息的标签
 * @returns {{ valid: true, id: number } | { valid: false, error: string }}
 */
function validateId(idStr, label = 'ID') {
  const id = parseInt(idStr, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return { valid: false, error: `无效的${label}` };
  }
  return { valid: true, id };
}

/**
 * 安全删除音频文件
 * @param {string|null|undefined} audioPath - 文件路径（绝对路径或以 /audio/ 开头的相对路径）
 */
function cleanAudioFile(audioPath) {
  if (!audioPath) return;
  let fp = audioPath;
  if (audioPath.startsWith('/audio/')) {
    fp = path.join(__dirname, '../..', audioPath);
  }
  // 安全检查：仅允许删除 audioDir 下的文件
  if (!fp.startsWith(audioDir)) return;
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
  }
}

module.exports = { validateId, cleanAudioFile, audioDir };
