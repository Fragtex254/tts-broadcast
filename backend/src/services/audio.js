const fs = require('fs');
const path = require('path');

const WAV_HEADER_SIZE = 44;

/**
 * 合并多个 WAV 文件为一个
 * 要求所有 WAV 文件格式一致（24kHz/16bit/mono）
 * @param {string[]} filePaths - WAV 文件路径数组（按播放顺序）
 * @returns {Buffer} 合并后的 WAV Buffer
 */
function mergeWavFiles(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    throw new Error('至少需要一个 WAV 文件');
  }

  const buffers = filePaths.map(fp => fs.readFileSync(fp));

  // 验证每个文件是有效的 WAV
  for (let i = 0; i < buffers.length; i++) {
    const buf = buffers[i];
    if (buf.length < WAV_HEADER_SIZE) {
      throw new Error(`WAV 文件 ${filePaths[i]} 太小（${buf.length} 字节），需要至少 ${WAV_HEADER_SIZE} 字节`);
    }
    const riff = buf.toString('ascii', 0, 4);
    const wave = buf.toString('ascii', 8, 12);
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      throw new Error(`WAV 文件 ${filePaths[i]} 不是有效的 WAV 格式`);
    }
  }

  // 用第一个文件的 header 作为模板
  const header = Buffer.from(buffers[0].slice(0, WAV_HEADER_SIZE));

  // 提取所有文件的 PCM 数据（从 byte 44 开始）
  const pcmChunks = buffers.map(buf => buf.slice(WAV_HEADER_SIZE));
  const totalPcmSize = pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);

  // 拼接所有 PCM 数据
  const mergedPcm = Buffer.concat(pcmChunks);

  // 更新 header 中的大小字段
  header.writeUInt32LE(WAV_HEADER_SIZE + totalPcmSize - 8, 4); // RIFF chunk size
  header.writeUInt32LE(totalPcmSize, 40);                       // data chunk size

  return Buffer.concat([header, mergedPcm]);
}

/**
 * 解析 voiceClone：如果是文件路径则读取并转为 base64 data URI，
 * 如果已经是 base64 data URI 则直接返回
 * @param {string} voiceClone - base64 data URI 或 /audio/ 开头的文件路径
 * @returns {Promise<string>} base64 data URI
 */
async function resolveVoiceClone(voiceClone) {
  if (!voiceClone) {
    throw new Error('voiceClone 不能为空');
  }
  if (voiceClone.startsWith('data:')) return voiceClone;
  if (voiceClone.startsWith('/audio/')) {
    const filePath = path.join(__dirname, '../..', voiceClone);
    if (fs.existsSync(filePath)) {
      const buffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.mp3' ? 'audio/mpeg' : 'audio/wav';
      return `data:${mime};base64,${buffer.toString('base64')}`;
    }
  }
  throw new Error('voiceClone 格式无效，需要 data: 前缀或 /audio/ 文件路径');
}

module.exports = { mergeWavFiles, resolveVoiceClone };
