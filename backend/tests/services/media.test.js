const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildChunkRanges, fileToAsrDataUrl } = require('../../src/services/media');

describe('媒体转 ASR data URL 服务', () => {
  test('wav 文件直接编码为 audio/wav data URL', async () => {
    const file = {
      originalname: 'sample.wav',
      mimetype: 'audio/wav',
      buffer: Buffer.from('wav-bytes')
    };

    const result = await fileToAsrDataUrl({ file });

    expect(result).toBe(`data:audio/wav;base64,${Buffer.from('wav-bytes').toString('base64')}`);
  });

  test('mp3 文件直接编码为 audio/mpeg data URL', async () => {
    const file = {
      originalname: 'sample.mp3',
      mimetype: 'audio/mpeg',
      buffer: Buffer.from('mp3-bytes')
    };

    const result = await fileToAsrDataUrl({ file });

    expect(result).toBe(`data:audio/mpeg;base64,${Buffer.from('mp3-bytes').toString('base64')}`);
  });

  test('mp3 临时文件路径可直接编码为 audio/mpeg data URL', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-broadcast-media-test-'));
    const inputPath = path.join(tmpDir, 'upload.mp3');

    try {
      fs.writeFileSync(inputPath, Buffer.from('mp3-path-bytes'));
      const file = {
        originalname: 'sample.mp3',
        mimetype: 'audio/mpeg',
        path: inputPath,
        size: Buffer.byteLength('mp3-path-bytes')
      };

      const result = await fileToAsrDataUrl({ file });

      expect(result).toBe(`data:audio/mpeg;base64,${Buffer.from('mp3-path-bytes').toString('base64')}`);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('缺少文件时抛出中文错误', async () => {
    await expect(fileToAsrDataUrl({ file: null }))
      .rejects.toThrow('请上传需要转录的音频或视频文件');
  });

  test('不支持的文件类型抛出中文错误', async () => {
    const file = {
      originalname: 'notes.txt',
      mimetype: 'text/plain',
      buffer: Buffer.from('hello')
    };

    await expect(fileToAsrDataUrl({ file }))
      .rejects.toThrow('暂不支持该文件类型');
  });

  test('根据静音点生成接近目标时长的切片范围', () => {
    const ranges = buildChunkRanges({
      duration: 62,
      silencePoints: [14.8, 30.1, 44.9],
      targetSeconds: 15,
      minSeconds: 10,
      maxSeconds: 30
    });

    expect(ranges).toEqual([
      { start: 0, duration: 14.8 },
      { start: 14.8, duration: 15.3 },
      { start: 30.1, duration: 14.8 },
      { start: 44.9, duration: 17.1 }
    ]);
  });

  test('没有合适静音点时按最大时长硬切', () => {
    const ranges = buildChunkRanges({
      duration: 65,
      silencePoints: [],
      targetSeconds: 15,
      minSeconds: 10,
      maxSeconds: 30
    });

    expect(ranges).toEqual([
      { start: 0, duration: 30 },
      { start: 30, duration: 30 },
      { start: 60, duration: 5 }
    ]);
  });
});
