const fs = require('fs');
const path = require('path');
const os = require('os');
const { mergeWavFiles } = require('../../src/services/audio');

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
