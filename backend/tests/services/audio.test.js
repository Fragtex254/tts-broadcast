const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');

const mockAudioLoggerWarn = jest.fn();
jest.mock('../../src/services/logger', () => ({
  createScopedLogger: jest.fn(() => ({
    warn: mockAudioLoggerWarn,
  })),
}));

const {
  buildAtempoFilter,
  mergeWavFiles,
  normalizePlaybackRate,
  resolveVoiceClone,
} = require('../../src/services/audio');

const audioDir = path.join(__dirname, '../../audio');
const LARGE_WAV_SAMPLE_COUNT = 24000 * 12;

/**
 * 创建一个最小的有效 WAV 文件（24kHz, 16bit, mono）
 * @param {number} sampleCount - PCM 样本数（每个样本 2 字节）
 * @returns {Buffer}
 */
function createTestWav(sampleCount) {
  const dataSize = sampleCount * 2; // 16bit = 2 bytes per sample
  const buffer = Buffer.alloc(44 + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt subchunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);      // subchunk1 size
  buffer.writeUInt16LE(1, 20);       // PCM format
  buffer.writeUInt16LE(1, 22);       // mono
  buffer.writeUInt32LE(24000, 24);   // 24kHz sample rate
  buffer.writeUInt32LE(48000, 28);   // byte rate (24000 * 1 * 2)
  buffer.writeUInt16LE(2, 32);       // block align (1 * 2)
  buffer.writeUInt16LE(16, 34);      // bits per sample

  // data subchunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // 填充 PCM 数据（递增值用于验证顺序）
  for (let i = 0; i < sampleCount; i++) {
    buffer.writeInt16LE(i % 32000, 44 + i * 2);
  }

  return buffer;
}

function createTestWavWithListChunk(sampleCount) {
  const pcm = createTestWav(sampleCount).slice(44);
  const listPayload = Buffer.from('INFOISFTtest');
  const listSize = listPayload.length + (listPayload.length % 2);
  const dataSize = pcm.length;
  const buffer = Buffer.alloc(12 + 24 + 8 + listSize + 8 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(buffer.length - 8, 4);
  buffer.write('WAVE', 8);

  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(24000, 24);
  buffer.writeUInt32LE(48000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);

  const listOffset = 36;
  buffer.write('LIST', listOffset);
  buffer.writeUInt32LE(listPayload.length, listOffset + 4);
  listPayload.copy(buffer, listOffset + 8);

  const dataOffset = listOffset + 8 + listSize;
  buffer.write('data', dataOffset);
  buffer.writeUInt32LE(dataSize, dataOffset + 4);
  pcm.copy(buffer, dataOffset + 8);

  return buffer;
}

describe('WAV 合并服务', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wav-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('合并两个 WAV 文件，header 大小正确', () => {
    const wav1 = createTestWav(100);
    const wav2 = createTestWav(200);

    const file1 = path.join(tmpDir, 'a.wav');
    const file2 = path.join(tmpDir, 'b.wav');
    fs.writeFileSync(file1, wav1);
    fs.writeFileSync(file2, wav2);

    const merged = mergeWavFiles([file1, file2]);

    // PCM 数据总大小 = (100 + 200) * 2 = 600
    expect(merged.length).toBe(44 + 600);

    // RIFF chunk size = 总大小 - 8
    expect(merged.readUInt32LE(4)).toBe(44 + 600 - 8);

    // data chunk size = 600
    expect(merged.readUInt32LE(40)).toBe(600);
  });

  test('合并三个 WAV 文件，PCM 数据按顺序拼接', () => {
    const wav1 = createTestWav(50);
    const wav2 = createTestWav(50);
    const wav3 = createTestWav(50);

    const files = [wav1, wav2, wav3].map((buf, i) => {
      const fp = path.join(tmpDir, `${i}.wav`);
      fs.writeFileSync(fp, buf);
      return fp;
    });

    const merged = mergeWavFiles(files);

    // 验证第一个文件的第一个 PCM 样本在正确位置
    const firstSample = merged.readInt16LE(44);
    expect(firstSample).toBe(0); // i % 32000 where i=0

    // 验证第二个文件的第一个 PCM 样本紧跟第一个文件
    const secondFileStart = 44 + 50 * 2;
    const secondFirstSample = merged.readInt16LE(secondFileStart);
    expect(secondFirstSample).toBe(0); // 新文件从 0 开始
  });

  test('单个文件合并返回相同内容', () => {
    const wav = createTestWav(100);
    const fp = path.join(tmpDir, 'single.wav');
    fs.writeFileSync(fp, wav);

    const merged = mergeWavFiles([fp]);
    expect(merged).toEqual(wav);
  });

  test('兼容包含 LIST 元数据块的 WAV，合并后输出标准 data chunk', () => {
    const file1 = path.join(tmpDir, 'with-list-a.wav');
    const file2 = path.join(tmpDir, 'with-list-b.wav');
    fs.writeFileSync(file1, createTestWavWithListChunk(100));
    fs.writeFileSync(file2, createTestWavWithListChunk(200));

    const merged = mergeWavFiles([file1, file2]);

    expect(merged.toString('ascii', 36, 40)).toBe('data');
    expect(merged.readUInt32LE(40)).toBe((100 + 200) * 2);
    expect(merged.length).toBe(44 + (100 + 200) * 2);
  });

  test('空文件列表抛出错误', () => {
    expect(() => mergeWavFiles([])).toThrow('至少需要一个 WAV 文件');
  });

  test('文件不存在时抛出错误', () => {
    expect(() => mergeWavFiles(['/nonexistent/path.wav'])).toThrow();
  });

  test('文件太小时抛出错误', () => {
    const tiny = path.join(tmpDir, 'tiny.wav');
    fs.writeFileSync(tiny, Buffer.alloc(10)); // 小于 44 字节
    expect(() => mergeWavFiles([tiny])).toThrow(/太小/);
  });
});

describe('音频不变调倍速工具', () => {
  test('校验并保留两位小数倍速', () => {
    expect(normalizePlaybackRate(1)).toBe(1);
    expect(normalizePlaybackRate(1.255)).toBe(1.25);
  });

  test('拒绝超出稳定范围的倍速', () => {
    expect(() => normalizePlaybackRate(0.49)).toThrow('倍速必须在');
    expect(() => normalizePlaybackRate(2.01)).toThrow('倍速必须在');
    expect(() => normalizePlaybackRate('1.5')).toThrow('倍速必须是数字');
  });

  test('使用 FFmpeg atempo filter 做不变调变速', () => {
    expect(buildAtempoFilter(1.5)).toBe('atempo=1.5');
  });
});

describe('resolveVoiceClone', () => {
  let cloneFixtureDir;
  let outsideFixtureDir;

  beforeEach(() => {
    fs.mkdirSync(audioDir, { recursive: true });
    cloneFixtureDir = fs.mkdtempSync(path.join(audioDir, 'voice-clone-test-'));
    outsideFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-clone-outside-'));
    mockAudioLoggerWarn.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(cloneFixtureDir, { recursive: true, force: true });
    fs.rmSync(outsideFixtureDir, { recursive: true, force: true });
  });

  function writeCloneFixture(filename, buffer) {
    const filePath = path.join(cloneFixtureDir, filename);
    fs.writeFileSync(filePath, buffer);
    return {
      filePath,
      audioPath: `/audio/${path.basename(cloneFixtureDir)}/${filename}`,
    };
  }

  function decodeDataUri(dataUri) {
    const [header, payload] = dataUri.split(',', 2);
    return {
      mime: header.slice('data:'.length, header.indexOf(';')),
      buffer: Buffer.from(payload, 'base64'),
    };
  }

  test('data: 前缀的 base64 直接返回', async () => {
    const input = 'data:audio/wav;base64,AAAA';
    const result = await resolveVoiceClone(input);
    expect(result).toBe(input);
  });

  test('较大 WAV 在内存中压缩为 24kHz mono 96kbps MP3', async () => {
    const wav = createTestWav(LARGE_WAV_SAMPLE_COUNT);
    const { audioPath } = writeCloneFixture('large.wav', wav);
    const execSpy = jest.spyOn(childProcess, 'execFile');

    const result = decodeDataUri(await resolveVoiceClone(audioPath));

    expect(result.mime).toBe('audio/mpeg');
    expect(result.buffer.length).toBeLessThan(wav.length * 0.5);
    expect(execSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['-ac', '1', '-ar', '24000', '-b:a', '96k', '-f', 'mp3', 'pipe:1']),
      expect.objectContaining({ encoding: 'buffer' }),
      expect.any(Function)
    );
  });

  test('小 MP3 直读为 audio/mpeg，不启动 FFmpeg', async () => {
    const mp3 = Buffer.from('ID3-small-mp3-fixture');
    const { audioPath } = writeCloneFixture('small.mp3', mp3);
    const execSpy = jest.spyOn(childProcess, 'execFile');

    const result = decodeDataUri(await resolveVoiceClone(audioPath));

    expect(result.mime).toBe('audio/mpeg');
    expect(result.buffer).toEqual(mp3);
    expect(execSpy).not.toHaveBeenCalled();
  });

  test('按绝对路径、mtime 和 size 复用缓存并在文件变化时失效', async () => {
    const firstWav = createTestWav(LARGE_WAV_SAMPLE_COUNT);
    const { filePath, audioPath } = writeCloneFixture('cached.wav', firstWav);
    const execSpy = jest.spyOn(childProcess, 'execFile');

    const first = await resolveVoiceClone(audioPath);
    const second = await resolveVoiceClone(audioPath);
    expect(second).toBe(first);
    expect(execSpy).toHaveBeenCalledTimes(1);

    const future = new Date(Date.now() + 5000);
    fs.utimesSync(filePath, future, future);
    await resolveVoiceClone(audioPath);
    expect(execSpy).toHaveBeenCalledTimes(2);

    fs.writeFileSync(filePath, createTestWav(LARGE_WAV_SAMPLE_COUNT + 24000));
    await resolveVoiceClone(audioPath);
    expect(execSpy).toHaveBeenCalledTimes(3);
  });

  test('FFmpeg 失败时记录 warning 并回退原始 WAV data URI', async () => {
    const wav = createTestWav(LARGE_WAV_SAMPLE_COUNT);
    const { audioPath } = writeCloneFixture('fallback.wav', wav);
    jest.spyOn(childProcess, 'execFile').mockImplementation((file, args, options, callback) => {
      callback(new Error('ffmpeg unavailable'), Buffer.alloc(0), Buffer.from('encoder failed'));
    });

    const result = decodeDataUri(await resolveVoiceClone(audioPath));

    expect(result.mime).toBe('audio/wav');
    expect(result.buffer.equals(wav)).toBe(true);
    expect(mockAudioLoggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        err: expect.any(Error),
        sourceExtension: '.wav',
        sourceSizeBytes: wav.length,
        targetSampleRate: 24000,
        targetChannels: 1,
        targetBitrateKbps: 96,
      }),
      'voiceClone WAV 压缩失败，已回退原始音频'
    );
  });

  test('无效输入（非 data: 且非文件路径）抛出校验错误', async () => {
    await expect(resolveVoiceClone('not-valid-input'))
      .rejects.toThrow('voiceClone 格式无效');
  });

  test('拒绝逃逸 audio 目录的路径', async () => {
    await expect(resolveVoiceClone('/audio/../../package.json'))
      .rejects.toThrow('音频路径无效');
  });

  test('拒绝 audio 目录内指向外部文件的 symlink', async () => {
    const outsideFile = path.join(outsideFixtureDir, 'outside.wav');
    fs.writeFileSync(outsideFile, createTestWav(100));
    const symlinkPath = path.join(cloneFixtureDir, 'escape.wav');
    fs.symlinkSync(outsideFile, symlinkPath);
    const audioPath = `/audio/${path.basename(cloneFixtureDir)}/escape.wav`;

    await expect(resolveVoiceClone(audioPath))
      .rejects.toThrow('voiceClone 音频路径无效');
  });

  test('空值抛出校验错误', async () => {
    await expect(resolveVoiceClone(null))
      .rejects.toThrow('voiceClone 不能为空');
    await expect(resolveVoiceClone(''))
      .rejects.toThrow('voiceClone 不能为空');
  });
});
