const mockMessagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockMessagesCreate,
    },
  }));
});

jest.mock('axios', () => ({
  post: jest.fn(),
  get: jest.fn(),
}));

const db = require('../../src/db');
const mimo = require('../../src/services/mimo');
const Anthropic = require('@anthropic-ai/sdk');
const axios = require('axios');

describe('MiMo 服务', () => {
  beforeEach(() => {
    mockMessagesCreate.mockReset();
    Anthropic.mockClear();
    axios.post.mockReset();
    axios.get.mockReset();
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('mimo_api_key', '"test-key"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_api_format', '"anthropic"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_base_url', '"https://token-plan-cn.xiaomimimo.com/anthropic"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_model', '"mimo-v2.5"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_system_prompt', '"你是一位专业的播音稿撰写者。"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_split_system_prompt', '"你是一个文本切分助手，只输出 JSON 数组格式。"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_thinking_enabled', 'true');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_split_thinking_enabled', 'false');
  });

  test('生成口播稿', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '大家好，欢迎收听今日 AI 简讯。感谢收听，我们明天再见。' }],
    });

    const mockItems = [
      {
        title: 'OpenAI 发布 GPT-5',
        summary: 'OpenAI 今日发布了最新的 GPT-5 模型...',
        source: 'OpenAI Blog',
        url: 'https://example.com'
      }
    ];
    const result = await mimo.rewriteToScript({
      items: mockItems,
      opening: '大家好，欢迎收听今日 AI 简讯。',
      closing: '感谢收听，我们明天再见。'
    });
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  test('testApiKey 函数存在', () => {
    expect(typeof mimo.testApiKey).toBe('function');
  });

  test('testApiKey 使用传入的 LLM API Key 验证当前输入', async () => {
    mockMessagesCreate.mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });

    await expect(mimo.testApiKey('anthropic', 'current-input-key')).resolves.toBe(true);

    expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'current-input-key',
      defaultHeaders: { 'api-key': 'current-input-key' },
    }));
    expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
      thinking: { type: 'disabled' },
    }));
  });

  test('testApiKey 使用传入的 LLM 配置验证当前输入', async () => {
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: 'ok' } }] },
    });

    await expect(mimo.testApiKey('anthropic', 'current-input-key', {
      apiFormat: 'openai',
      baseUrl: 'https://current.example/v1',
      model: 'current-model',
    })).resolves.toBe(true);

    expect(axios.post).toHaveBeenCalledWith(
      'https://current.example/v1/chat/completions',
      expect.objectContaining({ model: 'current-model' }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer current-input-key',
        }),
      })
    );
  });

  test('Anthropic 格式使用设置中的 baseURL、模型、系统提示词和 thinking 配置', async () => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_base_url', '"https://custom.example/anthropic"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_model', '"custom-model"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_system_prompt', '"自定义改写 system"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_thinking_enabled', 'false');
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '自定义改写结果' }],
    });

    const result = await mimo.rewriteToScript({
      items: [{ title: '标题', summary: '摘要', source: '来源' }],
      opening: '开场白',
      closing: '结束语',
    });

    expect(result).toBe('自定义改写结果');
    expect(Anthropic).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'test-key',
      baseURL: 'https://custom.example/anthropic',
      defaultHeaders: { 'api-key': 'test-key' },
    }));
    expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'custom-model',
      system: '自定义改写 system',
      thinking: { type: 'disabled' },
    }));
  });

  test('OpenAI 格式使用 chat completions 请求并解析内容', async () => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_api_format', '"openai"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_base_url', '"https://openai.example/v1"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_model', '"gpt-compatible"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_rewrite_system_prompt', '"OpenAI 改写 system"');
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: '改写结果' } }] },
    });

    const result = await mimo.rewriteToScript({
      items: [{ title: '标题', summary: '摘要', source: '来源' }],
      opening: '开场白',
      closing: '结束语',
    });

    expect(result).toBe('改写结果');
    expect(axios.post).toHaveBeenCalledWith(
      'https://openai.example/v1/chat/completions',
      expect.objectContaining({
        model: 'gpt-compatible',
        max_tokens: 2000,
        messages: expect.arrayContaining([
          { role: 'system', content: 'OpenAI 改写 system' },
          expect.objectContaining({ role: 'user' }),
        ]),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
          'api-key': 'test-key',
          'Content-Type': 'application/json',
        }),
      })
    );
  });

  test('MiniMax OpenAI 格式切分时显式关闭 thinking', async () => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_api_format', '"openai"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_base_url', '"https://api.minimaxi.com/v1"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_model', '"MiniMax-M3"');
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: '["第一句。","第二句。"]' } }] },
    });

    const segments = await mimo.splitScript('第一句。第二句。');

    expect(segments).toEqual(['第一句。', '第二句。']);
    expect(axios.post).toHaveBeenCalledWith(
      'https://api.minimaxi.com/v1/chat/completions',
      expect.objectContaining({
        model: 'MiniMax-M3',
        max_tokens: 4000,
        thinking: { type: 'disabled' },
      }),
      expect.any(Object)
    );
  });

  test('OpenAI 格式返回空内容时抛出中文错误', async () => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_api_format', '"openai"');
    axios.post.mockResolvedValue({
      data: { choices: [{ message: { content: '' } }] },
    });

    await expect(mimo.rewriteToScript({
      items: [{ title: '标题', summary: '摘要', source: '来源' }],
      opening: '开场白',
      closing: '结束语',
    })).rejects.toThrow('LLM API 返回内容为空');
  });

  test('Anthropic 格式根据图片反推音色描述', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: '{"designPrompt":"青年女性，清亮柔和，温和角色感","stylePrompt":"语气克制温柔，语速适中，短句间轻微停顿","characterSummary":"明亮温和的角色气质"}'
      }],
    });

    const result = await mimo.inferVoiceDesignFromImage({
      imageBuffer: Buffer.from('fake-png'),
      mimeType: 'image/png',
    });

    expect(result).toMatchObject({
      designPrompt: '青年女性，清亮柔和，温和角色感',
      stylePrompt: '语气克制温柔，语速适中，短句间轻微停顿',
      characterSummary: '明亮温和的角色气质',
    });
    expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'mimo-v2.5',
      system: expect.stringContaining('不识别真实声纹'),
      thinking: { type: 'disabled' },
      messages: [
        expect.objectContaining({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'image',
              source: expect.objectContaining({
                type: 'base64',
                media_type: 'image/png',
                data: Buffer.from('fake-png').toString('base64'),
              }),
            }),
            expect.objectContaining({ type: 'text' }),
          ]),
        }),
      ],
    }));
    const promptText = mockMessagesCreate.mock.calls[0][0].messages[0].content.find((item) => item.type === 'text').text;
    expect(promptText).toContain('性别年龄 + 音色质感 + 角色感');
    expect(promptText).toContain('语气情绪 + 语速节奏');
    expect(promptText).toContain('designPrompt 不要写语速、节奏、咬字、情绪表演、停顿、尾音、距离感');
  });

  test('OpenAI 格式根据图片反推音色描述', async () => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_api_format', '"openai"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_base_url', '"https://openai.example/v1"');
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_model', '"gpt-vision"');
    axios.post.mockResolvedValue({
      data: {
        choices: [{
          message: {
            content: '```json\n{"designPrompt":"少女，低柔透明，冷静角色感","stylePrompt":"语气疏离冷静，语速偏慢，短句轻停","characterSummary":"冷静克制的角色气质"}\n```'
          }
        }]
      },
    });

    const result = await mimo.inferVoiceDesignFromImage({
      imageBuffer: Buffer.from('fake-webp'),
      mimeType: 'image/webp',
    });

    expect(result.designPrompt).toBe('少女，低柔透明，冷静角色感');
    expect(result.stylePrompt).toBe('语气疏离冷静，语速偏慢，短句轻停');
    expect(axios.post).toHaveBeenCalledWith(
      'https://openai.example/v1/chat/completions',
      expect.objectContaining({
        model: 'gpt-vision',
        messages: expect.arrayContaining([
          { role: 'system', content: expect.stringContaining('不识别真实声纹') },
          expect.objectContaining({
            role: 'user',
            content: expect.arrayContaining([
              expect.objectContaining({ type: 'text' }),
              expect.objectContaining({
                type: 'image_url',
                image_url: {
                  url: `data:image/webp;base64,${Buffer.from('fake-webp').toString('base64')}`,
                },
              }),
            ]),
          }),
        ]),
      }),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-key',
        }),
      })
    );
  });

  test('图片反推非 JSON 输出时使用纯文本兜底', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '少年，温柔明亮，好奇角色感' }],
    });

    const result = await mimo.inferVoiceDesignFromImage({
      imageBuffer: Buffer.from('fake-jpg'),
      mimeType: 'image/jpeg',
    });

    expect(result).toMatchObject({
      designPrompt: '少年，温柔明亮，好奇角色感',
      stylePrompt: '',
      characterSummary: '',
    });
  });

  test('图片反推不暴露表演导演配置', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          designPrompt: '成熟女性，低柔冷静，疏离角色感',
          stylePrompt: '语气冷静疏离，语速偏慢，短句尾音轻收',
          characterSummary: '冷静疏离',
          performanceRole: '克制疏离的女性角色',
          performanceScene: '深夜独白',
          performanceDirection: '语速偏慢，尾音轻收，带一点气声',
          performanceTags: ['冷静', '气声'],
        }),
      }],
    });

    const result = await mimo.inferVoiceDesignFromImage({
      imageBuffer: Buffer.from('fake-png'),
      mimeType: 'image/png',
    });

    expect(result).toEqual({
      designPrompt: '成熟女性，低柔冷静，疏离角色感',
      stylePrompt: '语气冷静疏离，语速偏慢，短句尾音轻收',
      characterSummary: '冷静疏离',
    });
  });

  test('为试听文本建议合法标签', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: '{"taggedText":"[温柔，平静]你好，[轻笑]欢迎收听。","stylePrompt":"语气温柔平静，语速适中，问候后轻停顿"}'
      }],
    });

    const result = await mimo.suggestTrialTextTags({
      text: '你好，欢迎收听。',
      voiceDesign: '清亮柔和的年轻女性声线',
      stylePrompt: '语气温柔，语速适中',
    });

    expect(result).toEqual({
      taggedText: '[温柔，平静]你好，[轻笑]欢迎收听。',
      stylePrompt: '语气温柔平静，语速适中，问候后轻停顿',
    });
    expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        expect.objectContaining({
          content: expect.stringContaining('气口、情绪弧线、语速快慢变化、停顿位置和重音落点'),
        }),
      ],
      system: '你是 MiMo TTS 标签编辑助手，只输出 JSON 对象。',
      thinking: { type: 'disabled' },
    }));
  });

  test('试听文本标签建议会把旧圆括号归一为方括号', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: '{"taggedText":"(温柔 平静)你好，[轻笑]欢迎收听。"}'
      }],
    });

    const result = await mimo.suggestTrialTextTags({
      text: '你好，欢迎收听。',
    });

    expect(result).toEqual({
      taggedText: '[温柔，平静]你好，[轻笑]欢迎收听。',
      stylePrompt: '',
    });
  });

  test('图片反推遇到不支持视觉的模型时返回可操作错误', async () => {
    const error = new Error('unsupported image content block');
    error.status = 400;
    mockMessagesCreate.mockRejectedValue(error);

    await expect(mimo.inferVoiceDesignFromImage({
      imageBuffer: Buffer.from('fake-png'),
      mimeType: 'image/png',
    })).rejects.toThrow('当前 LLM 模型或接口不支持图片输入');
  });

  test('LLM 401 错误映射为 API Key 提示', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('401 {"error":{"message":"Invalid API Key","code":"401","type":"invalid_key"}}'));

    await expect(mimo.formatTranscriptionText('需要排版的文本'))
      .rejects.toThrow('LLM API Key 无效或已过期，请在设置中重新配置');
  });

  test('generateSpeech 函数存在', () => {
    expect(typeof mimo.generateSpeech).toBe('function');
  });

  test('splitScript 存在且为函数', () => {
    expect(typeof mimo.splitScript).toBe('function');
  });

  test('formatTranscriptionText 存在且为函数', () => {
    expect(typeof mimo.formatTranscriptionText).toBe('function');
  });

  test('splitScript 切分口播稿', async () => {
    const script = `大家好，欢迎收听今日AI简讯。今天我们来聊聊几个重要的AI动态。首先是OpenAI发布了最新的GPT-5模型，这款模型在推理能力上有了显著提升。其次是谷歌推出了新的Gemini版本，在多模态理解方面表现出色。以上就是今天的AI简讯，感谢收听，我们明天再见。`;
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([
        '大家好，欢迎收听今日AI简讯。今天我们来聊聊几个重要的AI动态。',
        '首先是OpenAI发布了最新的GPT-5模型，这款模型在推理能力上有了显著提升。其次是谷歌推出了新的Gemini版本，在多模态理解方面表现出色。',
        '以上就是今天的AI简讯，感谢收听，我们明天再见。'
      ]) }],
    });

    const segments = await mimo.splitScript(script);
    expect(Array.isArray(segments)).toBe(true);
    expect(segments.length).toBeGreaterThan(1);
    segments.forEach(seg => {
      expect(typeof seg).toBe('string');
      expect(seg.length).toBeGreaterThan(0);
    });
  });

  test('splitScript 剥离模型输出中的 think 内容后解析 JSON', async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [{
        type: 'text',
        text: '<think>这里是模型推理过程，不是 JSON。</think>\n\n["第一句。","第二句。"]'
      }],
    });

    const segments = await mimo.splitScript('第一句。第二句。');

    expect(segments).toEqual(['第一句。', '第二句。']);
  });

  test('splitScript 对超过 1024 字的 AI 结果做本地兜底切分', async () => {
    const longText = '一'.repeat(1100);
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify([longText]) }],
    });

    const segments = await mimo.splitScript(longText);

    expect(segments.length).toBe(2);
    expect(segments.every((seg) => seg.length <= 1024)).toBe(true);
  });

  test('splitScript 遇到 AI JSON 截断时使用本地切分兜底', async () => {
    const script = [
      '第一段开头，' + '甲'.repeat(1800) + '第一段结尾。',
      '第二段开头，' + '乙'.repeat(1800) + '第二段结尾。'
    ].join('\n\n');
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '["第一段开头，甲甲甲' }],
    });

    const segments = await mimo.splitScript(script);
    const combined = segments.join('');

    expect(mockMessagesCreate.mock.calls.length).toBeGreaterThan(1);
    expect(segments.length).toBeGreaterThan(1);
    expect(segments.every((seg) => seg.length <= 1024)).toBe(true);
    expect(combined).toContain('第一段开头');
    expect(combined).toContain('第二段结尾');
  });

  describe('rewriteToScript 错误路径', () => {
    test('空 items 抛出错误', async () => {
      await expect(mimo.rewriteToScript({ items: [] }))
        .rejects.toThrow('请提供有效的资讯列表');
    });

    test('非数组 items 抛出错误', async () => {
      await expect(mimo.rewriteToScript({ items: 'not-array' }))
        .rejects.toThrow('请提供有效的资讯列表');
    });
  });

  describe('splitScript 错误路径', () => {
    test('空文本抛出错误', async () => {
      await expect(mimo.splitScript(''))
        .rejects.toThrow('请提供有效的口播稿文本');
    });

    test('非字符串抛出错误', async () => {
      await expect(mimo.splitScript(null))
        .rejects.toThrow('请提供有效的口播稿文本');
    });
  });

  describe('formatTranscriptionText', () => {
    test('将转录文本排版为自然段', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '大家好，今天聊 AI。\n\n首先是新模型发布。' }],
      });

      const result = await mimo.formatTranscriptionText('大家好今天聊 AI 首先是新模型发布');

      expect(result).toBe('大家好，今天聊 AI。\n\n首先是新模型发布。');
      expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
        system: '你是一个转录稿排版助手，只输出排版后的正文。',
        max_tokens: 4000,
      }));
    });

    test('排版始终禁用 thinking，不复用切分 thinking 设置', async () => {
      db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('llm_split_thinking_enabled', 'true');
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '大家好，今天聊 AI。\n\n首先是新模型发布。' }],
      });

      await mimo.formatTranscriptionText('大家好今天聊 AI 首先是新模型发布');

      expect(mockMessagesCreate).toHaveBeenCalledWith(expect.objectContaining({
        thinking: { type: 'disabled' },
      }));
    });

    test('剥离模型输出中的 think 内容', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{
          type: 'text',
          text: '<think>这里是模型推理过程，不应展示。</think>\n\n大家好，今天聊 AI。\n\n首先是新模型发布。'
        }],
      });

      const result = await mimo.formatTranscriptionText('大家好今天聊 AI 首先是新模型发布');

      expect(result).toBe('大家好，今天聊 AI。\n\n首先是新模型发布。');
      expect(result).not.toContain('<think>');
      expect(result).not.toContain('模型推理过程');
    });

    test('排版结果疑似截断时自动拆小重试，避免静默覆盖完整转录稿', async () => {
      const text = `${'第一段内容'.repeat(40)}。${'第二段内容'.repeat(40)}。这是末尾不能丢。`;
      mockMessagesCreate
        .mockResolvedValueOnce({ content: [{ type: 'text', text: `${'第一段内容'.repeat(40)}。第二段只到一半` }] })
        .mockResolvedValueOnce({ content: [{ type: 'text', text: `${'第一段内容'.repeat(40)}。` }] })
        .mockResolvedValueOnce({ content: [{ type: 'text', text: `${'第二段内容'.repeat(40)}。这是末尾不能丢。` }] });

      const result = await mimo.formatTranscriptionText(text);

      expect(mockMessagesCreate).toHaveBeenCalledTimes(3);
      expect(result).toContain('这是末尾不能丢');
    });

    test('很短文本排版结果仍疑似截断时抛出错误', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '第一段内容。\n\n第二段只到一半' }],
      });

      await expect(mimo.formatTranscriptionText('第一段内容 第二段只到一半 这是末尾不能丢'))
        .rejects.toThrow('AI 排版结果疑似不完整');
    });

    test('长转录稿分块排版，避免单次输出过长导致末尾截断', async () => {
      const longText = [
        '第一段开头' + '甲'.repeat(2600) + '第一段结尾。',
        '第二段开头' + '乙'.repeat(2600) + '第二段结尾。',
        '第三段开头' + '丙'.repeat(1200) + '第三段结尾。'
      ].join('');
      mockMessagesCreate.mockImplementation(async (payload) => {
        const text = payload.messages[0].content.split('转录文本：\n')[1];
        return { content: [{ type: 'text', text }] };
      });

      const result = await mimo.formatTranscriptionText(longText);

      expect(mockMessagesCreate.mock.calls.length).toBeGreaterThan(1);
      expect(result).toContain('第一段结尾');
      expect(result).toContain('第二段结尾');
      expect(result).toContain('第三段结尾');
    });

    test('空文本抛出错误', async () => {
      await expect(mimo.formatTranscriptionText('')).rejects.toThrow('请提供需要排版的转录文本');
    });
  });

  describe('suggestStyleTags', () => {
    test('为每句返回候选标签之一', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '["平静","严肃","活泼"]' }],
      });
      const tags = await mimo.suggestStyleTags(['第一句', '第二句', '第三句'], ['平静', '严肃', '活泼']);
      expect(tags).toEqual(['平静', '严肃', '活泼']);
    });

    test('非候选标签归为空串', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '["平静","唱歌"]' }],
      });
      const tags = await mimo.suggestStyleTags(['A', 'B'], ['平静', '严肃']);
      expect(tags).toEqual(['平静', '']);
    });

    test('数量不一致时使用本地兜底标签', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '["平静"]' }],
      });

      const tags = await mimo.suggestStyleTags(['历史命运', '战争风险'], ['平静', '严肃', '深沉']);

      expect(tags).toEqual(['深沉', '严肃']);
    });

    test('剥离 markdown 代码块', async () => {
      mockMessagesCreate.mockResolvedValue({
        content: [{ type: 'text', text: '```json\n["平静","严肃"]\n```' }],
      });
      const tags = await mimo.suggestStyleTags(['A', 'B'], ['平静', '严肃']);
      expect(tags).toEqual(['平静', '严肃']);
    });

    test('长句子列表分批请求并保持结果数量', async () => {
      mockMessagesCreate
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: '["平静","平静","平静","平静","平静","平静","平静","平静","平静","平静"]' }],
        })
        .mockResolvedValueOnce({
          content: [{ type: 'text', text: '["严肃","深沉"]' }],
        });
      const texts = Array.from({ length: 12 }, (_, i) => `第 ${i + 1} 句`);

      const tags = await mimo.suggestStyleTags(texts, ['平静', '严肃', '深沉']);

      expect(tags).toHaveLength(12);
      expect(tags.slice(0, 10)).toEqual(Array(10).fill('平静'));
      expect(tags.slice(10)).toEqual(['严肃', '深沉']);
      expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    });
  });
});
