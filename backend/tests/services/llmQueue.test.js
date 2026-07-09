const { LLMQueueManager, estimateLlmTokenCost } = require('../../src/services/llmQueue');

describe('LLM 请求队列', () => {
  test('默认使用 MiniMax-M3 官方限额的 75%', () => {
    const queue = new LLMQueueManager();

    expect(queue.getStatus()).toEqual(expect.objectContaining({
      rpmLimit: 150,
      tpmLimit: 7500000,
      maxConcurrent: 4,
    }));
  });

  test('配置值不会超过 MiniMax-M3 官方硬上限', () => {
    const queue = new LLMQueueManager({
      rpmLimit: 999,
      tpmLimit: 99999999,
    });

    expect(queue.getStatus()).toEqual(expect.objectContaining({
      rpmLimit: 200,
      tpmLimit: 10000000,
    }));
  });

  test('估算 token 成本包含 prompt、system、图片和输出预算', () => {
    const cost = estimateLlmTokenCost({
      prompt: '你好，世界',
      systemPrompt: 'system prompt',
      maxTokens: 100,
      imageBuffer: Buffer.alloc(2048),
    });

    expect(cost).toBeGreaterThanOrEqual(108);
  });
});
