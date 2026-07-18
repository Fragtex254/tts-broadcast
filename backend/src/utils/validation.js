// backend/src/utils/validation.js
const path = require('path');
const fs = require('fs');

const audioDir = process.env.NODE_ENV === 'test'
  ? path.join(__dirname, '../../.test-audio')
  : path.join(__dirname, '../../audio');
const assetDir = process.env.NODE_ENV === 'test'
  ? path.join(__dirname, '../../.test-assets')
  : path.join(__dirname, '../../assets');

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
 * 把公开的 /audio/ 路径解析到当前运行环境的音频根目录。
 * 测试环境因此只会读取 .test-audio，且拒绝路径穿越。
 * @param {string} audioPath - 以 /audio/ 开头的公开路径
 * @returns {string} 安全的绝对文件路径
 */
function resolveAudioFilePath(audioPath) {
  if (typeof audioPath !== 'string' || !audioPath.startsWith('/audio/')) {
    throw new Error('音频路径无效');
  }
  const resolvedPath = path.resolve(audioDir, audioPath.slice('/audio/'.length));
  const relativePath = path.relative(audioDir, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error('音频路径无效');
  }
  return resolvedPath;
}

/**
 * 安全删除音频文件
 * @param {string|null|undefined} audioPath - 文件路径（绝对路径或以 /audio/ 开头的相对路径）
 */
function cleanAudioFile(audioPath) {
  if (!audioPath) return;
  let fp = audioPath;
  if (audioPath.startsWith('/audio/')) {
    try {
      fp = resolveAudioFilePath(audioPath);
    } catch {
      return;
    }
  }
  const resolvedPath = path.resolve(fp);
  const relativePath = path.relative(audioDir, resolvedPath);
  // 安全检查：仅允许删除 audioDir 内的文件，避免相似前缀或路径穿越。
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) return;
  if (fs.existsSync(resolvedPath)) {
    fs.unlinkSync(resolvedPath);
  }
}

/**
 * 安全删除资产文件
 * @param {string|null|undefined} assetPath - 文件路径（绝对路径或以 /assets/ 开头的相对路径）
 */
function cleanAssetFile(assetPath) {
  if (!assetPath) return;
  let fp = assetPath;
  if (assetPath.startsWith('/assets/')) {
    fp = path.join(assetDir, assetPath.slice('/assets/'.length));
  }
  if (!fp.startsWith(assetDir)) return;
  if (fs.existsSync(fp)) {
    fs.unlinkSync(fp);
  }
}

module.exports = {
  validateId,
  cleanAudioFile,
  cleanAssetFile,
  resolveAudioFilePath,
  audioDir,
  assetDir,
};
