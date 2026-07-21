const fs = require('fs');
const os = require('os');
const path = require('path');
const childProcess = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const { createScopedLogger } = require('./logger');
const { audioDir, resolveAudioFilePath } = require('../utils/validation');

const WAV_HEADER_SIZE = 44;
const MIN_PLAYBACK_RATE = 0.5;
const MAX_PLAYBACK_RATE = 2;
const RIFF_HEADER_SIZE = 12;
const VOICE_CLONE_WAV_TRANSCODE_THRESHOLD_BYTES = 512 * 1024;
const VOICE_CLONE_TRANSCODE_MAX_BUFFER_BYTES = 20 * 1024 * 1024;
const VOICE_CLONE_CACHE_MAX_ENTRIES = 32;
const VOICE_CLONE_AUDIO_ROOT = path.resolve(audioDir);
const voiceCloneDataUriCache = new Map();
const logger = createScopedLogger('audio-service');

/**
 * 归一化并校验播放/导出倍速。
 * @param {unknown} value - 待校验倍速
 * @returns {number} 合法倍速
 */
function normalizePlaybackRate(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('倍速必须是数字');
  }
  const rounded = Math.round(value * 100) / 100;
  if (rounded < MIN_PLAYBACK_RATE || rounded > MAX_PLAYBACK_RATE) {
    throw new Error(`倍速必须在 ${MIN_PLAYBACK_RATE} 到 ${MAX_PLAYBACK_RATE} 之间`);
  }
  return rounded;
}

/**
 * 构建 FFmpeg atempo filter。atempo 不变调变速，当前业务限制 0.5x-2.0x。
 * @param {number} playbackRate - 播放/导出倍速
 * @returns {string} filter 表达式
 */
function buildAtempoFilter(playbackRate) {
  const rate = normalizePlaybackRate(playbackRate);
  return `atempo=${rate}`;
}

function readChunkId(buffer, offset) {
  return buffer.toString('ascii', offset, offset + 4);
}

function nextChunkOffset(offset, size) {
  return offset + 8 + size + (size % 2);
}

function parseWavFile(buffer, filePath) {
  if (buffer.length < WAV_HEADER_SIZE) {
    throw new Error(`WAV 文件 ${filePath} 太小（${buffer.length} 字节），需要至少 ${WAV_HEADER_SIZE} 字节`);
  }
  if (readChunkId(buffer, 0) !== 'RIFF' || readChunkId(buffer, 8) !== 'WAVE') {
    throw new Error(`WAV 文件 ${filePath} 不是有效的 WAV 格式`);
  }

  let fmt = null;
  let data = null;
  let offset = RIFF_HEADER_SIZE;
  while (offset + 8 <= buffer.length) {
    const id = readChunkId(buffer, offset);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.length) {
      throw new Error(`WAV 文件 ${filePath} 的 ${id} chunk 不完整`);
    }

    if (id === 'fmt ') {
      if (size < 16) {
        throw new Error(`WAV 文件 ${filePath} 的 fmt chunk 无效`);
      }
      fmt = {
        audioFormat: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sampleRate: buffer.readUInt32LE(start + 4),
        byteRate: buffer.readUInt32LE(start + 8),
        blockAlign: buffer.readUInt16LE(start + 12),
        bitsPerSample: buffer.readUInt16LE(start + 14),
      };
    } else if (id === 'data') {
      data = buffer.slice(start, end);
    }

    offset = nextChunkOffset(offset, size);
  }

  if (!fmt) {
    throw new Error(`WAV 文件 ${filePath} 缺少 fmt chunk`);
  }
  if (!data) {
    throw new Error(`WAV 文件 ${filePath} 缺少 data chunk`);
  }
  if (fmt.audioFormat !== 1) {
    throw new Error(`WAV 文件 ${filePath} 不是 PCM 格式`);
  }

  return { fmt, data };
}

function ensureSameFormat(base, current, filePath) {
  const fields = ['audioFormat', 'channels', 'sampleRate', 'byteRate', 'blockAlign', 'bitsPerSample'];
  for (const field of fields) {
    if (base[field] !== current[field]) {
      throw new Error(`WAV 文件 ${filePath} 格式与首个文件不一致`);
    }
  }
}

function createPcmWavBuffer(fmt, pcm) {
  const header = Buffer.alloc(WAV_HEADER_SIZE);
  header.write('RIFF', 0);
  header.writeUInt32LE(WAV_HEADER_SIZE + pcm.length - 8, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(fmt.channels, 22);
  header.writeUInt32LE(fmt.sampleRate, 24);
  header.writeUInt32LE(fmt.byteRate, 28);
  header.writeUInt16LE(fmt.blockAlign, 32);
  header.writeUInt16LE(fmt.bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * 合并多个 WAV 文件为一个
 * 要求所有 WAV 文件格式一致；会解析 chunk，兼容包含 LIST 等元数据块的 WAV。
 * @param {string[]} filePaths - WAV 文件路径数组（按播放顺序）
 * @returns {Buffer} 合并后的 WAV Buffer
 */
function mergeWavFiles(filePaths) {
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    throw new Error('至少需要一个 WAV 文件');
  }

  const parsed = filePaths.map(fp => parseWavFile(fs.readFileSync(fp), fp));
  const fmt = parsed[0].fmt;
  for (let i = 1; i < parsed.length; i += 1) {
    ensureSameFormat(fmt, parsed[i].fmt, filePaths[i]);
  }

  const pcmChunks = parsed.map(item => item.data);
  const totalPcmSize = pcmChunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const mergedPcm = Buffer.concat(pcmChunks);

  if (mergedPcm.length !== totalPcmSize) {
    throw new Error('WAV PCM 数据合并失败');
  }

  return createPcmWavBuffer(fmt, mergedPcm);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(ffmpegPath, args, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`FFmpeg 变速处理失败: ${stderr || error.message}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function transcodeVoiceCloneWavToMp3(filePath) {
  return new Promise((resolve, reject) => {
    childProcess.execFile(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-nostdin',
      '-i', filePath,
      '-vn',
      '-map_metadata', '-1',
      '-ac', '1',
      '-ar', '24000',
      '-codec:a', 'libmp3lame',
      '-b:a', '96k',
      '-f', 'mp3',
      'pipe:1',
    ], {
      encoding: 'buffer',
      maxBuffer: VOICE_CLONE_TRANSCODE_MAX_BUFFER_BYTES,
    }, (error, stdout, stderr) => {
      if (error) {
        const detail = Buffer.isBuffer(stderr) ? stderr.toString('utf8').trim() : String(stderr || '').trim();
        reject(new Error(`FFmpeg 音色参考压缩失败: ${detail || error.message}`));
        return;
      }

      const output = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout || '');
      if (output.length === 0) {
        reject(new Error('FFmpeg 音色参考压缩失败: 未产生 MP3 数据'));
        return;
      }
      resolve(output);
    });
  });
}

function toAudioDataUri(mime, buffer) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function getVoiceCloneMime(extension) {
  return extension === '.mp3' ? 'audio/mpeg' : 'audio/wav';
}

function getCachedVoiceClone(filePath, stats) {
  const cached = voiceCloneDataUriCache.get(filePath);
  if (!cached || cached.mtimeMs !== stats.mtimeMs || cached.size !== stats.size) {
    voiceCloneDataUriCache.delete(filePath);
    return null;
  }

  // 重新插入以维持简单的 LRU 顺序。
  voiceCloneDataUriCache.delete(filePath);
  voiceCloneDataUriCache.set(filePath, cached);
  return cached.promise;
}

function cacheVoiceClone(filePath, stats, promise) {
  voiceCloneDataUriCache.set(filePath, {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
    promise,
  });
  while (voiceCloneDataUriCache.size > VOICE_CLONE_CACHE_MAX_ENTRIES) {
    const oldestKey = voiceCloneDataUriCache.keys().next().value;
    voiceCloneDataUriCache.delete(oldestKey);
  }
}

function deleteCachedVoiceClone(filePath, promise) {
  if (voiceCloneDataUriCache.get(filePath)?.promise === promise) {
    voiceCloneDataUriCache.delete(filePath);
  }
}

function isPathInsideRoot(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath !== ''
    && relativePath !== '..'
    && !relativePath.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relativePath);
}

function resolveVoiceCloneFilePath(relativePath) {
  const candidatePath = path.resolve(VOICE_CLONE_AUDIO_ROOT, relativePath);
  if (!isPathInsideRoot(VOICE_CLONE_AUDIO_ROOT, candidatePath)) {
    throw new Error('voiceClone 音频路径无效');
  }
  if (!fs.existsSync(candidatePath)) return null;

  const realAudioRoot = fs.realpathSync(VOICE_CLONE_AUDIO_ROOT);
  const realFilePath = fs.realpathSync(candidatePath);
  if (!isPathInsideRoot(realAudioRoot, realFilePath)) {
    throw new Error('voiceClone 音频路径无效');
  }
  return realFilePath;
}

async function createVoiceCloneDataUri({ filePath, extension, stats }) {
  if (extension === '.wav' && stats.size >= VOICE_CLONE_WAV_TRANSCODE_THRESHOLD_BYTES) {
    try {
      const mp3Buffer = await transcodeVoiceCloneWavToMp3(filePath);
      return {
        dataUri: toAudioDataUri('audio/mpeg', mp3Buffer),
        cacheable: true,
      };
    } catch (error) {
      logger.warn({
        err: error,
        sourceExtension: extension,
        sourceSizeBytes: stats.size,
        targetSampleRate: 24000,
        targetChannels: 1,
        targetBitrateKbps: 96,
      }, 'voiceClone WAV 压缩失败，已回退原始音频');
      return {
        dataUri: toAudioDataUri('audio/wav', fs.readFileSync(filePath)),
        // 不缓存失败降级结果，让后续请求可在 FFmpeg 恢复后重试压缩。
        cacheable: false,
      };
    }
  }

  return {
    dataUri: toAudioDataUri(getVoiceCloneMime(extension), fs.readFileSync(filePath)),
    cacheable: true,
  };
}

/**
 * 按 segment playback_rate 逐段做不变调变速后合并为 WAV Buffer。
 * 原始 segment 音频不会被覆盖；临时变速文件会在处理结束后清理。
 * @param {Array<{audio_path:string, playback_rate?:number}>} segments - 已生成的段落列表
 * @returns {Promise<Buffer>} 合并后的 WAV Buffer
 */
async function mergeSegmentAudioWithRates(segments) {
  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('至少需要一个 segment 音频');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-broadcast-speed-'));
  const mergePaths = [];

  try {
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const inputPath = resolveAudioFilePath(segment.audio_path);
      if (!fs.existsSync(inputPath)) {
        throw new Error(`第 ${index + 1} 段音频文件不存在`);
      }

      const playbackRate = normalizePlaybackRate(Number(segment.playback_rate || 1));
      if (playbackRate === 1) {
        mergePaths.push(inputPath);
        continue;
      }

      const outputPath = path.join(tempDir, `segment_${index}_${playbackRate}.wav`);
      await runFfmpeg([
        '-hide_banner',
        '-y',
        '-i', inputPath,
        '-filter:a', buildAtempoFilter(playbackRate),
        '-vn',
        '-acodec', 'pcm_s16le',
        '-ar', '24000',
        '-ac', '1',
        outputPath,
      ]);
      mergePaths.push(outputPath);
    }

    return mergeWavFiles(mergePaths);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
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
    const relativePath = voiceClone.slice('/audio/'.length);
    const filePath = resolveVoiceCloneFilePath(relativePath);
    if (filePath) {
      const stats = fs.statSync(filePath);
      const cached = getCachedVoiceClone(filePath, stats);
      if (cached) {
        const result = await cached;
        return result.dataUri;
      }

      const extension = path.extname(filePath).toLowerCase();
      const promise = createVoiceCloneDataUri({ filePath, extension, stats });
      cacheVoiceClone(filePath, stats, promise);
      try {
        const result = await promise;
        if (!result.cacheable) {
          deleteCachedVoiceClone(filePath, promise);
        }
        return result.dataUri;
      } catch (error) {
        deleteCachedVoiceClone(filePath, promise);
        throw error;
      }
    }
  }
  throw new Error('voiceClone 格式无效，需要 data: 前缀或 /audio/ 文件路径');
}

module.exports = {
  MIN_PLAYBACK_RATE,
  MAX_PLAYBACK_RATE,
  normalizePlaybackRate,
  buildAtempoFilter,
  mergeWavFiles,
  mergeSegmentAudioWithRates,
  resolveVoiceClone,
};
