const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

const ASR_TARGET_SECONDS = 15;
const ASR_MIN_SECONDS = 10;
const ASR_MAX_SECONDS = 30;
const SILENCE_NOISE = '-35dB';
const SILENCE_DURATION = 0.5;
const MP3_BITRATE = '48k';

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

function roundSeconds(value) {
  return Math.round(value * 1000) / 1000;
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    execFile(ffmpegPath, args, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`媒体转换失败: ${error.message}`));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function parseDuration(output) {
  const match = output.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!match) return 0;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  return hours * 3600 + minutes * 60 + seconds;
}

function parseSilencePoints(output) {
  const points = [];
  let silenceStart = null;

  output.split('\n').forEach((line) => {
    const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
    if (startMatch) {
      silenceStart = Number(startMatch[1]);
      return;
    }

    const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
    if (endMatch && silenceStart !== null) {
      const silenceEnd = Number(endMatch[1]);
      points.push(roundSeconds((silenceStart + silenceEnd) / 2));
      silenceStart = null;
    }
  });

  return [...new Set(points)].sort((a, b) => a - b);
}

function buildChunkRanges({
  duration,
  silencePoints,
  targetSeconds = ASR_TARGET_SECONDS,
  minSeconds = ASR_MIN_SECONDS,
  maxSeconds = ASR_MAX_SECONDS
}) {
  if (!duration || duration <= 0) {
    return [];
  }

  const ranges = [];
  const sortedPoints = [...silencePoints].sort((a, b) => a - b);
  let start = 0;

  while (duration - start > maxSeconds) {
    const minBoundary = start + minSeconds;
    const maxBoundary = start + maxSeconds;
    const targetBoundary = start + targetSeconds;
    const candidates = sortedPoints.filter(point => point > minBoundary && point <= maxBoundary);
    const end = candidates.length > 0
      ? candidates.reduce((best, point) => (
        Math.abs(point - targetBoundary) < Math.abs(best - targetBoundary) ? point : best
      ), candidates[0])
      : maxBoundary;

    ranges.push({ start: roundSeconds(start), duration: roundSeconds(end - start) });
    start = end;
  }

  ranges.push({ start: roundSeconds(start), duration: roundSeconds(duration - start) });
  return ranges.filter(range => range.duration > 0.05);
}

async function analyzeMedia(inputPath) {
  const { stderr } = await runFfmpeg([
    '-hide_banner',
    '-i', inputPath,
    '-af', `silencedetect=noise=${SILENCE_NOISE}:d=${SILENCE_DURATION}`,
    '-f', 'null',
    '-'
  ]);

  return {
    duration: parseDuration(stderr),
    silencePoints: parseSilencePoints(stderr)
  };
}

async function writeMp3Slice({ inputPath, outputPath, start, duration }) {
  const args = [
    '-y',
    '-ss', String(start),
    '-i', inputPath,
    '-t', String(duration),
    '-vn',
    '-ac', '1',
    '-ar', '24000',
    '-codec:a', 'libmp3lame',
    '-b:a', MP3_BITRATE,
    outputPath
  ];

  await runFfmpeg(args);
}

async function convertToWavDataUrl(file, ext) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-broadcast-asr-'));
  const inputPath = path.join(tmpDir, `input.${ext}`);
  const outputPath = path.join(tmpDir, 'output.wav');

  try {
    fs.writeFileSync(inputPath, file.buffer);
    await runFfmpeg([
      '-y',
      '-i', inputPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '24000',
      '-ac', '1',
      outputPath
    ]);
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

async function appendMp3SliceDataUrls({ inputPath, tmpDir, range, maxDataUrlSize, dataUrls, chunkIndex }) {
  const outputPath = path.join(tmpDir, `chunk_${chunkIndex}_${Date.now()}.mp3`);
  await writeMp3Slice({
    inputPath,
    outputPath,
    start: range.start,
    duration: range.duration
  });

  const dataUrl = bufferToDataUrl(fs.readFileSync(outputPath), 'audio/mpeg');
  if (dataUrl.length <= maxDataUrlSize) {
    dataUrls.push(dataUrl);
    return;
  }

  if (range.duration <= 5) {
    throw new Error('音频内容过大，转换后超过 ASR 10MB 限制');
  }

  const half = roundSeconds(range.duration / 2);
  await appendMp3SliceDataUrls({
    inputPath,
    tmpDir,
    range: { start: range.start, duration: half },
    maxDataUrlSize,
    dataUrls,
    chunkIndex: `${chunkIndex}_a`
  });
  await appendMp3SliceDataUrls({
    inputPath,
    tmpDir,
    range: { start: roundSeconds(range.start + half), duration: roundSeconds(range.duration - half) },
    maxDataUrlSize,
    dataUrls,
    chunkIndex: `${chunkIndex}_b`
  });
}

async function convertToMp3DataUrl(file, ext) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-broadcast-asr-'));
  const inputPath = path.join(tmpDir, `input.${ext}`);
  const outputPath = path.join(tmpDir, 'output.mp3');

  try {
    fs.writeFileSync(inputPath, file.buffer);
    await writeMp3Slice({
      inputPath,
      outputPath,
      start: 0,
      duration: 24 * 60 * 60
    });
    return bufferToDataUrl(fs.readFileSync(outputPath), 'audio/mpeg');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

async function convertToChunkedDataUrls({ file, ext, maxDataUrlSize }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-broadcast-asr-'));
  const inputPath = path.join(tmpDir, `input.${ext}`);

  try {
    fs.writeFileSync(inputPath, file.buffer);
    const { duration, silencePoints } = await analyzeMedia(inputPath);
    const ranges = buildChunkRanges({ duration, silencePoints });
    if (ranges.length === 0) {
      throw new Error('无法识别媒体时长，请检查文件是否有效');
    }

    const dataUrls = [];
    for (let i = 0; i < ranges.length; i++) {
      await appendMp3SliceDataUrls({
        inputPath,
        tmpDir,
        range: ranges[i],
        maxDataUrlSize,
        dataUrls,
        chunkIndex: i
      });
    }
    return dataUrls;
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * 将上传媒体转换为一个或多个 MiMo ASR data URL，小文件保持单次请求，大文件按静音切片。
 * @param {Object} params
 * @param {Object} params.file - multer 文件对象
 * @param {number} params.maxDataUrlSize - 单片 data URL 最大长度
 * @returns {Promise<string[]>} data URL 列表
 */
async function fileToAsrDataUrls({ file, maxDataUrlSize }) {
  if (!file || !file.buffer) {
    throw new Error('请上传需要转录的音频或视频文件');
  }

  const ext = getExtension(file);
  if (DIRECT_AUDIO_TYPES.has(ext)) {
    const dataUrl = bufferToDataUrl(file.buffer, DIRECT_AUDIO_TYPES.get(ext));
    if (dataUrl.length <= maxDataUrlSize) {
      return [dataUrl];
    }
    return convertToChunkedDataUrls({ file, ext, maxDataUrlSize });
  }

  if (CONVERTIBLE_TYPES.has(ext)) {
    const dataUrl = await convertToMp3DataUrl(file, ext);
    if (dataUrl.length <= maxDataUrlSize) {
      return [dataUrl];
    }
    return convertToChunkedDataUrls({ file, ext, maxDataUrlSize });
  }

  throw new Error('暂不支持该文件类型，请上传 wav、mp3、m4a、mp4、mov 或 webm');
}

module.exports = { buildChunkRanges, fileToAsrDataUrl, fileToAsrDataUrls };
