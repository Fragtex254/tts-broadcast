const contentExportService = require('../../src/services/contentExportService');

function createProject(reasoning = 'AI 根据观点推断的可能理由') {
  return {
    title: '测试项目',
    topic: '一个值得讨论的问题',
    thesis: '',
    personal_judgment: '',
    personal_practice: '',
    discussion_question: '',
    claims: [{
      usage_note: '',
      claim: {
        claim: '观点内容',
        question: '正在回答什么？',
        reasoning,
        evidence_excerpt: '可追溯的原文证据',
        podcast_name: '测试播客',
        episode_title: '测试单集',
        speaker_name: '嘉宾甲',
        start_seconds: 0,
        end_seconds: 10,
        source_url: '',
      },
    }],
  };
}

describe('内容项目导出服务', () => {
  test('小红书草稿把模型 reasoning 标成 AI 整理且提醒核对原文', () => {
    const markdown = contentExportService.exportProject({
      project: createProject(),
      platform: 'xiaohongshu',
    });

    expect(markdown).toContain('## AI 整理的可能理由（待核对原文）');
    expect(markdown).toContain('- AI 整理理由（待核对）：AI 根据观点推断的可能理由');
    expect(markdown).not.toContain('嘉宾使用的理由');
    expect(markdown).not.toContain('   - 理由：');
  });

  test('模型未返回 reasoning 时不宣称逐字稿没有理由', () => {
    const markdown = contentExportService.exportProject({
      project: createProject(''),
      platform: 'wechat',
    });

    expect(markdown).toContain('AI 未整理出理由，请根据原文证据核对');
    expect(markdown).not.toContain('逐字稿未提供额外理由');
  });
});
