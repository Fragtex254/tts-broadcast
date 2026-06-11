jest.mock('axios');
const axios = require('axios');

const { postChatCompletions } = require('../../src/services/mimoApiClient');

describe('MiMo 标准 API 客户端', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('发送 chat completions 请求时带上 api-key、JSON 头和超时', async () => {
    axios.post.mockResolvedValue({ data: { ok: true } });

    const result = await postChatCompletions({
      apiKey: 'test-key',
      payload: { model: 'mimo-v2.5-asr' },
      serviceName: 'ASR'
    });

    expect(result).toEqual({ ok: true });
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.xiaomimimo.com/v1/chat/completions',
      { model: 'mimo-v2.5-asr' },
      {
        headers: {
          'api-key': 'test-key',
          'Content-Type': 'application/json'
        },
        timeout: 120000
      }
    );
  });

  test('429 限流自动重试最多三次并最终成功', async () => {
    axios.post
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValueOnce({ data: { ok: true } });

    const result = await postChatCompletions({
      apiKey: 'test-key',
      payload: { model: 'mimo-v2.5-asr' },
      serviceName: 'ASR'
    });

    expect(result).toEqual({ ok: true });
    expect(axios.post).toHaveBeenCalledTimes(3);
  });

  test('429 重试耗尽后抛出友好错误', async () => {
    axios.post.mockRejectedValue({ response: { status: 429 } });

    await expect(postChatCompletions({
      apiKey: 'test-key',
      payload: { model: 'mimo-v2.5-asr' },
      serviceName: 'ASR'
    })).rejects.toThrow('MiMo API 请求过于频繁，请稍后再试');

    expect(axios.post).toHaveBeenCalledTimes(3);
  });

  test('401 映射为 API Key 无效提示', async () => {
    axios.post.mockRejectedValue({ response: { status: 401 } });

    await expect(postChatCompletions({
      apiKey: 'bad-key',
      payload: { model: 'mimo-v2.5-asr' },
      serviceName: 'ASR'
    })).rejects.toThrow('MiMo API Key 无效，请检查设置');
  });

  test('超时和网络错误带服务名', async () => {
    axios.post.mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' });
    await expect(postChatCompletions({
      apiKey: 'test-key',
      payload: {},
      serviceName: 'ASR'
    })).rejects.toThrow('MiMo ASR API 请求超时，请稍后再试');

    axios.post.mockRejectedValueOnce({ code: 'ENOTFOUND', message: 'network down' });
    await expect(postChatCompletions({
      apiKey: 'test-key',
      payload: {},
      serviceName: 'ASR'
    })).rejects.toThrow('MiMo ASR API 网络错误: network down');
  });
});
