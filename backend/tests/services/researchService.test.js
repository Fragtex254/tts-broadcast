const db = require('../../src/db');
const podcastTranscriptStore = require('../../src/services/podcastTranscriptStore');
const researchStore = require('../../src/services/researchStore');
const researchService = require('../../src/services/researchService');

function seedClaim({ claim, question, transcriptionId, speakerKey = 'speaker-0001', index = 0, topicTags = ['AI 编程'] }) {
  return researchStore.replaceClaims(transcriptionId, { model: 'test', claims: [{
    speakerKey, question, claim, reasoning: '测试理由', evidenceExcerpt: claim,
    evidenceStartIndex: index, evidenceEndIndex: index, startSeconds: index, endSeconds: index + 1,
    topicTags, contentValue: 80, confidence: 0.9,
  }] })[0];
}

function createRecord(fileName, text) {
  return podcastTranscriptStore.create({
    record: { fileName, text, contentMode: 'podcast', structureStatus: 'ready' },
    transcript: { speakers: [{ speakerKey: 'speaker-0001', displayName: '嘉宾', sortOrder: 0 }], segments: [{ segmentIndex: 0, speakerKey: 'speaker-0001', startSeconds: 0, endSeconds: 1, text }], turns: [{ turnIndex: 0, speakerKey: 'speaker-0001', startSeconds: 0, endSeconds: 1, text, evidenceSegmentIndexes: [0] }] },
  });
}

describe('跨播客观点研究服务', () => {
  beforeEach(() => db.prepare('DELETE FROM transcription_results').run());

  test('Embedding 未配置时使用关键词检索返回跨播客观点', async () => {
    const first = createRecord('一期.wav', 'AI 会减少初级招聘');
    const second = createRecord('二期.wav', '设计师讨论审美');
    seedClaim({ transcriptionId: first.id, question: 'AI 会减少程序员岗位吗', claim: '初级招聘会先减少' });
    seedClaim({ transcriptionId: second.id, question: '设计如何进步', claim: '多看作品', topicTags: ['设计'] });

    const { items, total } = await researchService.searchClaims({ query: 'AI 程序员岗位', embedText: async () => null });

    expect(items).toHaveLength(1);
    expect(total).toBe(1);
    expect(items[0]).toMatchObject({ search_mode: 'keyword', claim: { transcription_id: first.id } });
  });

  test('搜索分页按 offset 截取且 total 为全量匹配数', async () => {
    const first = createRecord('一期.wav', 'AI 会减少初级招聘');
    const second = createRecord('二期.wav', 'AI 辅助设计师');
    const third = createRecord('三期.wav', 'AI 辅助教学');
    seedClaim({ transcriptionId: first.id, question: 'AI 会减少程序员岗位吗', claim: '初级招聘会先减少' });
    seedClaim({ transcriptionId: second.id, question: 'AI 对设计影响', claim: 'AI 辅助设计师' });
    seedClaim({ transcriptionId: third.id, question: 'AI 对教育影响', claim: 'AI 辅助教学' });

    const page1 = await researchService.searchClaims({ query: 'AI', limit: 2, offset: 0, embedText: async () => null });
    const page2 = await researchService.searchClaims({ query: 'AI', limit: 2, offset: 2, embedText: async () => null });

    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page2.items).toHaveLength(1);
    expect(page2.total).toBe(3);
    expect(page1.items.map((item) => item.claim.id)).not.toContain(page2.items[0].claim.id);
  });

  test('关系分析拒绝 LLM 引用未选择的观点', async () => {
    const first = createRecord('一期.wav', '观点一');
    const second = createRecord('二期.wav', '观点二');
    const a = seedClaim({ transcriptionId: first.id, question: '问题', claim: '观点一' });
    const b = seedClaim({ transcriptionId: second.id, question: '问题', claim: '观点二' });
    const generateText = async () => JSON.stringify({ relations: [{ claim_a_id: a.id, claim_b_id: 99999, relation_type: 'support', explanation: '伪造', confidence: 1 }] });

    await expect(researchService.analyzeRelations({ claimIds: [a.id, b.id], generateText, model: 'bad' }))
      .rejects.toThrow('未选择的观点');
  });

  test('已缓存关系覆盖全部已选观点时不重复调用 LLM', async () => {
    const first = createRecord('一期.wav', '观点一');
    const second = createRecord('二期.wav', '观点二');
    const a = seedClaim({ transcriptionId: first.id, question: '问题', claim: '观点一' });
    const b = seedClaim({ transcriptionId: second.id, question: '问题', claim: '观点二' });
    researchStore.upsertRelation({ claimAId: a.id, claimBId: b.id, relationType: 'oppose', explanation: '两条证据给出相反判断', confidence: 0.9, analysisModel: 'cached-model' });
    const generateText = jest.fn();

    const result = await researchService.analyzeRelations({ claimIds: [a.id, b.id], generateText, model: 'new-model' });

    expect(result.cached).toBe(true);
    expect(result.synthesis.disagreements).toEqual(['两条证据给出相反判断']);
    expect(generateText).not.toHaveBeenCalled();
  });

  test('500 条观点下搜索查询次数不随数量增长', async () => {
    const record = createRecord('长播客.wav', 'AI 合集');
    researchStore.replaceClaims(record.id, {
      model: 'test',
      claims: Array.from({ length: 500 }, (_, index) => ({
        speakerKey: 'speaker-0001', question: `AI 问题 ${index}`, claim: `AI 观点 ${index}`, reasoning: '理由',
        evidenceExcerpt: '证据', evidenceStartIndex: 0, evidenceEndIndex: 0, startSeconds: 0, endSeconds: 1,
        topicTags: ['AI'], contentValue: 50, confidence: 0.8,
      })),
    });

    const prepareSpy = jest.spyOn(db, 'prepare');
    try {
      const { items } = await researchService.searchClaims({ query: 'AI', limit: 20, embedText: async () => null });
      expect(items.length).toBeGreaterThan(0);
      expect(prepareSpy.mock.calls.length).toBeLessThanOrEqual(3);
    } finally {
      prepareSpy.mockRestore();
    }
  });

  test('10 条候选关系分析查询次数为常数级', async () => {
    const record = createRecord('合集.wav', '观点合集');
    const claims = researchStore.replaceClaims(record.id, {
      model: 'test',
      claims: Array.from({ length: 10 }, (_, index) => ({
        speakerKey: 'speaker-0001', question: `问题 ${index}`, claim: `观点 ${index}`, reasoning: '理由',
        evidenceExcerpt: '证据', evidenceStartIndex: 0, evidenceEndIndex: 0, startSeconds: 0, endSeconds: 1,
        topicTags: ['AI'], contentValue: 50, confidence: 0.8,
      })),
    });
    for (let left = 0; left < claims.length; left++) {
      for (let right = left + 1; right < claims.length; right++) {
        researchStore.upsertRelation({ claimAId: claims[left].id, claimBId: claims[right].id, relationType: 'support', explanation: '一致', confidence: 0.9, analysisModel: 'cached' });
      }
    }

    const prepareSpy = jest.spyOn(db, 'prepare');
    try {
      const result = await researchService.analyzeRelations({ claimIds: claims.map((claim) => claim.id), generateText: jest.fn(), model: 'new' });
      expect(result.cached).toBe(true);
      // 批量 IN 查询 + 关系批量查询为常数；旧实现需要 10 + 45 次
      expect(prepareSpy.mock.calls.length).toBeLessThanOrEqual(4);
    } finally {
      prepareSpy.mockRestore();
    }
  });
});
