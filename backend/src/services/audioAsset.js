// 音频资产写入与清理服务
const fs = require('fs');
const path = require('path');
const { audioDir, cleanAudioFile } = require('../utils/validation');

if (!fs.existsSync(audioDir)) {
  fs.mkdirSync(audioDir, { recursive: true });
}

/**
 * 保存音频 Buffer 到 audio 目录
 * @param {string} filename - 文件名
 * @param {Buffer} buffer - 音频 Buffer
 * @returns {string} /audio/ 相对路径
 */
function writeAudioFile(filename, buffer) {
  const filepath = path.join(audioDir, filename);
  fs.writeFileSync(filepath, buffer);
  return `/audio/${filename}`;
}

/**
 * 保存整篇播报音频
 * @param {Buffer} buffer - 音频 Buffer
 * @param {number|string} idOrTimestamp - 播报 ID 或时间戳
 * @returns {string} /audio/ 相对路径
 */
function writeBroadcastAudio(buffer, idOrTimestamp = Date.now()) {
  return writeAudioFile(`broadcast_${idOrTimestamp}.wav`, buffer);
}

/**
 * 保存合并后的播报音频
 * @param {number} broadcastId - 播报 ID
 * @param {Buffer} buffer - 音频 Buffer
 * @returns {string} /audio/ 相对路径
 */
function writeMergedBroadcastAudio(broadcastId, buffer) {
  return writeAudioFile(`broadcast_${broadcastId}_merged.wav`, buffer);
}

/**
 * 保存 segment 音频
 * @param {number} broadcastId - 播报 ID
 * @param {number} index - segment 序号
 * @param {Buffer} buffer - 音频 Buffer
 * @returns {string} /audio/ 相对路径
 */
function writeSegmentAudio(broadcastId, index, buffer) {
  return writeAudioFile(`segment_${broadcastId}_${index}.wav`, buffer);
}

/**
 * 保存试听音频
 * @param {string} type - 试听类型
 * @param {Buffer} buffer - 音频 Buffer
 * @returns {string} /audio/ 相对路径
 */
function writeTrialAudio(type, buffer) {
  return writeAudioFile(`preset_trial_${type}_${Date.now()}.wav`, buffer);
}

/**
 * 保存上传的预设音频文件
 * @param {Object} params
 * @param {number} params.presetId - 预设 ID
 * @param {Object} params.file - multer 文件对象
 * @param {string} params.kind - trial 或 original
 * @returns {string} /audio/ 相对路径
 */
function writePresetUpload({ presetId, file, kind }) {
  const ext = path.extname(file.originalname) || '.wav';
  const filename = kind === 'original'
    ? `preset_original_${presetId}${ext}`
    : `preset_trial_${presetId}${ext}`;
  return writeAudioFile(filename, file.buffer);
}

/**
 * 清理旧的试听音频文件，保留最近 maxKeep 个
 * @param {string} prefix - 文件名前缀
 * @param {number} [maxKeep=10] - 保留数量
 */
function cleanupOldTrials(prefix, maxKeep = 10) {
  try {
    const files = fs.readdirSync(audioDir)
      .filter(f => f.startsWith(prefix))
      .map(f => ({
        name: f,
        time: fs.statSync(path.join(audioDir, f)).mtimeMs
      }))
      .sort((a, b) => b.time - a.time);

    for (let i = maxKeep; i < files.length; i++) {
      cleanAudioFile(path.join(audioDir, files[i].name));
    }
  } catch {
    // 清理失败不影响主流程
  }
}

module.exports = {
  writeAudioFile,
  writeBroadcastAudio,
  writeMergedBroadcastAudio,
  writeSegmentAudio,
  writeTrialAudio,
  writePresetUpload,
  cleanupOldTrials,
};
