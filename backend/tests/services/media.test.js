const { fileToAsrDataUrl } = require('../../src/services/media');

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
});
