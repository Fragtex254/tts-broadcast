const db = require('../../src/db');
const podcastTranscriptStore = require('../../src/services/podcastTranscriptStore');
const researchStore = require('../../src/services/researchStore');

function createTranscript() {
  return podcastTranscriptStore.create({
    record: { fileName: '岗位讨论.wav', text: 'AI 会改变招聘。', contentMode: 'podcast', structureStatus: 'ready' },
    transcript: {
      speakers: [
        { speakerKey: 'speaker-0001', displayName: '嘉宾', sortOrder: 0, speakerScope: 'global' },
        { speakerKey: 'speaker-0002', displayName: '主持人', sortOrder: 1, speakerScope: 'global' },
      ],
      segments: [
        { segmentIndex: 0, sourceIndex: 0, speakerKey: 'speaker-0001', startSeconds: 10, endSeconds: 14, text: '重复编码最容易自动化。' },
        { segmentIndex: 1, sourceIndex: 1, speakerKey: 'speaker-0001', startSeconds: 14, endSeconds: 20, text: '初级岗位招聘会先减少。' },
        { segmentIndex: 2, sourceIndex: 2, speakerKey: 'speaker-0002', startSeconds: 21, endSeconds: 25, text: '这还需要观察。' },
      ],
      turns: [
        { turnIndex: 0, speakerKey: 'speaker-0001', startSeconds: 10, endSeconds: 20, text: '重复编码最容易自动化。初级岗位招聘会先减少。', evidenceSegmentIndexes: [0, 1] },
        { turnIndex: 1, speakerKey: 'speaker-0002', startSeconds: 21, endSeconds: 25, text: '这还需要观察。', evidenceSegmentIndexes: [2] },
      ],
    },
  });
}

describe('观点提取服务', () => {
  beforeEach(() => db.prepare('DELETE FROM transcription_results').run());

  test('只保存合法 Speaker 与 Segment 证据，并由后端派生摘录和时间', async () => {
    const claimService = require('../../src/services/transcriptionClaimService');
    const record = createTranscript();
    const generateText = jest.fn().mockResolvedValue(JSON.stringify({ claims: [{
      question: 'AI 是否减少程序员岗位？',
      claim: 'AI 会首先减少初级程序员招聘。',
      reasoning: '重复编码工作最容易自动化。',
      speaker_key: 'speaker-0001',
      evidence_start_index: 0,
      evidence_end_index: 1,
      topic_tags: ['AI 编程', '就业'],
      content_value: 86,
      confidence: 0.9,
    }] }));

    const claims = await claimService.generate({ transcriptionId: record.id, generateText, model: 'test-model' });

    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({
      speaker_key: 'speaker-0001', start_seconds: 10, end_seconds: 20,
      evidence_excerpt: '重复编码最容易自动化。\n初级岗位招聘会先减少。', status: 'active',
    });
    expect(claims[0].embedding).toBeNull();
  });

  test('拒绝跨 Speaker 的伪造证据范围并保留旧观点', async () => {
    const claimService = require('../../src/services/transcriptionClaimService');
    const record = createTranscript();
    researchStore.replaceClaims(record.id, { model: 'old', claims: [{
      speakerKey: 'speaker-0001', question: '旧问题', claim: '旧观点', reasoning: '', evidenceExcerpt: '旧证据',
      evidenceStartIndex: 0, evidenceEndIndex: 0, startSeconds: 10, endSeconds: 14,
      topicTags: [], contentValue: 50, confidence: 0.8,
    }] });
    const generateText = jest.fn().mockResolvedValue(JSON.stringify({ claims: [{
      question: '伪造问题', claim: '伪造观点', reasoning: '跨说话人拼接', speaker_key: 'speaker-0001',
      evidence_start_index: 0, evidence_end_index: 2, topic_tags: [], content_value: 99, confidence: 1,
    }] }));

    await expect(claimService.generate({ transcriptionId: record.id, generateText, model: 'bad' }))
      .rejects.toThrow('证据范围包含其他 Speaker');
    expect(researchStore.listClaims({ transcriptionId: record.id })[0].claim).toBe('旧观点');
  });
});
