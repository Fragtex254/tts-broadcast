const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const DIRECT_AUDIO_TYPES = new Map([
  ['wav', 'audio/wav'],
  ['mp3', 'audio/mpeg'],
  ['mpeg', 'audio/mpeg']
]);

const CONVERTIBLE_TYPES = new Set(['m4a', 'mp4', 'mov', 'webm']);

function getExtension(file) {
  return path.extname(file.originalname || '').toLowerCase().replace('.', '');
}

function bufferToDataUrl(buffer, mimeType) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

function runFfmpeg(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, [
      '-y',
      '-i', inputPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '24000',
      '-ac', '1',
      outputPath
    ], (error) => {
      if (error) {
        reject(new Error(`媒体转换失败: ${error.message}`));
        return;
      }
      resolve();
    });
  });
}

async function convertToWavDataUrl(file, ext) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-broadcast-asr-'));
  const inputPath = path.join(tmpDir, `input.${ext}`);
  const outputPath = path.join(tmpDir, 'output.wav');

  try {
    fs.writeFileSync(inputPath, file.buffer);
    await runFfmpeg(inputPath, outputPath);
    const wavBuffer = fs.readFileSync(outputPath);
    return bufferToDataUrl(wavBuffer, 'audio/wav');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * 将上传媒体转换为 MiMo ASR 接受的 data URL
 * @param {Object} params
 * @param {Object} params.file - multer 文件对象
 * @returns {Promise<string>} data URL
 */
async function fileToAsrDataUrl({ file }) {
  if (!file || !file.buffer) {
    throw new Error('请上传需要转录的音频或视频文件');
  }

  const ext = getExtension(file);
  if (DIRECT_AUDIO_TYPES.has(ext)) {
    return bufferToDataUrl(file.buffer, DIRECT_AUDIO_TYPES.get(ext));
  }

  if (CONVERTIBLE_TYPES.has(ext)) {
    return convertToWavDataUrl(file, ext);
  }

  throw new Error('暂不支持该文件类型，请上传 wav、mp3、m4a、mp4、mov 或 webm');
}

module.exports = { fileToAsrDataUrl };
