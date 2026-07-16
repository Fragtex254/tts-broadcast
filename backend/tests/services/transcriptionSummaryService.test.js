const db = require('../../src/db');
const podcastTranscriptStore = require('../../src/services/podcastTranscriptStore');

describe('Transcript 总结服务', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM transcription_results').run();
  });

  test('分层生成摘要并只用证据片段派生时间范围', async () => {
    const transcriptionSummaryService = require('../../src/services/transcriptionSummaryService');
    const record = podcastTranscriptStore.create({
      record: {
        fileName: 'podcast.wav',
        text: '主持人谈产品。嘉宾谈市场。',
        contentMode: 'podcast',
        structureStatus: 'ready',
        speakerScope: 'global'
      },
      transcript: {
        speakers: [
          { speakerKey: 'speaker-0001', displayName: '说话人 1', sortOrder: 0, speakerScope: 'global' },
          { speakerKey: 'speaker-0002', displayName: '说话人 2', sortOrder: 1, speakerScope: 'global' }
        ],
        segments: [
          { segmentIndex: 0, speakerKey: 'speaker-0001', sourceSpeaker: 'S01', speakerScope: 'global', speakerResolution: '', chunkIndex: 0, startSeconds: 10, endSeconds: 20, text: '主持人谈产品。' },
          { segmentIndex: 1, speakerKey: 'speaker-0002', sourceSpeaker: 'S02', speakerScope: 'global', speakerResolution: '', chunkIndex: 0, startSeconds: 21, endSeconds: 35, text: '嘉宾谈市场。' }
        ],
        turns: [
          { turnIndex: 0, speakerKey: 'speaker-0001', startSeconds: 10, endSeconds: 20, text: '主持人谈产品。', evidenceSegmentIndexes: [0] },
          { turnIndex: 1, speakerKey: 'speaker-0002', startSeconds: 21, endSeconds: 35, text: '嘉宾谈市场。', evidenceSegmentIndexes: [1] }
        ]
      }
    });
    const generateText = jest.fn()
      .mockResolvedValueOnce(JSON.stringify({
        digest: '产品与市场讨论',
        claims: [
          { content: '产品观点', speaker_key: 'speaker-0001', evidence_start_index: 0, evidence_end_index: 0 },
          { content: '市场观点', speaker_key: 'speaker-0002', evidence_start_index: 1, evidence_end_index: 1 }
        ]
      }))
      .mockResolvedValueOnce(JSON.stringify({
        one_liner: '一期关于产品与市场的讨论。',
        overview: '主持人与嘉宾分别讨论了产品和市场。',
        chapters: [{ title: '产品与市场', content: '双方给出不同角度。', evidence_start_index: 0, evidence_end_index: 1 }],
        speaker_viewpoints: [{ speaker_key: 'speaker-0002', content: '嘉宾关注市场。', evidence_start_index: 1, evidence_end_index: 1 }],
        highlights: [{ title: '核心判断', content: '市场决定产品节奏。', evidence_start_index: 0, evidence_end_index: 1 }]
      }));

    await transcriptionSummaryService.generate({
      transcriptionId: record.id,
      generateText,
      model: 'test-model'
    });

    const detail = podcastTranscriptStore.getDetail(record.id);
    expect(detail.record).toMatchObject({ summary_status: 'completed', summary_model: 'test-model' });
    expect(detail.summary).toMatchObject({
      one_liner: '一期关于产品与市场的讨论。',
      overview: '主持人与嘉宾分别讨论了产品和市场。'
    });
    expect(detail.summaryItems).toEqual(expect.arrayContaining([
      expect.objectContaining({
        item_type: 'speaker_viewpoint',
        speaker_key: 'speaker-0002',
        start_seconds: 21,
        end_seconds: 35
      }),
      expect.objectContaining({
        item_type: 'chapter',
        start_seconds: 10,
        end_seconds: 35
      })
    ]));
    expect(detail.claims).toEqual(expect.arrayContaining([
      expect.objectContaining({ speaker_key: 'speaker-0001', claim: '产品观点', start_seconds: 10, end_seconds: 20 }),
      expect.objectContaining({ speaker_key: 'speaker-0002', claim: '市场观点', start_seconds: 21, end_seconds: 35 })
    ]));
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  test('拒绝批次没有提供过的证据索引并保留旧摘要', async () => {
    const transcriptionSummaryService = require('../../src/services/transcriptionSummaryService');
    const record = podcastTranscriptStore.create({
      record: {
        fileName: 'adversarial.wav',
        text: '唯一事实。另一段未被批次声明的事实。',
        contentMode: 'podcast',
        structureStatus: 'ready'
      },
      transcript: {
        speakers: [{ speakerKey: 'speaker-0001', displayName: '说话人 1', sortOrder: 0, speakerScope: 'global' }],
        segments: [
          { sourceIndex: 0, segmentIndex: 0, speakerKey: 'speaker-0001', startSeconds: 0, endSeconds: 2, text: '唯一事实。' },
          { sourceIndex: 1, segmentIndex: 1, speakerKey: 'speaker-0001', startSeconds: 3, endSeconds: 4, text: '另一段事实。' }
        ],
        turns: [
          { turnIndex: 0, speakerKey: 'speaker-0001', startSeconds: 0, endSeconds: 2, text: '唯一事实。', evidenceSegmentIndexes: [0] }
        ]
      }
    });
    const generateText = jest.fn()
      .mockResolvedValueOnce(JSON.stringify({
        digest: '只声明了片段 0',
        claims: [{ content: '唯一事实', speaker_key: 'speaker-0001', evidence_start_index: 0, evidence_end_index: 0 }]
      }))
      .mockResolvedValueOnce(JSON.stringify({
        one_liner: '伪造证据',
        overview: '试图引用未进入笔记的片段。',
        chapters: [{ title: '错误章节', content: '错误', evidence_start_index: 1, evidence_end_index: 1 }],
        speaker_viewpoints: [],
        highlights: []
      }));
    podcastTranscriptStore.replaceSummary(record.id, {
      oneLiner: '旧摘要',
      overview: '已经验证过的旧内容。',
      model: 'old-model',
      items: [{
        itemType: 'chapter', sortOrder: 0, speakerKey: '', title: '旧章节', content: '旧内容',
        evidenceStartIndex: 0, evidenceEndIndex: 0, startSeconds: 0, endSeconds: 2
      }]
    });

    await expect(transcriptionSummaryService.generate({
      transcriptionId: record.id,
      generateText,
      model: 'test-model'
    })).rejects.toThrow('未进入分批笔记');

    const detail = podcastTranscriptStore.getDetail(record.id);
    expect(detail.record.summary_status).toBe('failed');
    expect(detail.summary.one_liner).toBe('旧摘要');
  });

  test('允许章节连接两个已验证 claim 端点，中间时间仍由 Segment 事实派生', async () => {
    const transcriptionSummaryService = require('../../src/services/transcriptionSummaryService');
    const segments = Array.from({ length: 4 }, (_, index) => ({
      sourceIndex: index,
      segmentIndex: index,
      speakerKey: 'speaker-0001',
      startSeconds: index * 10,
      endSeconds: index * 10 + 5,
      text: `片段 ${index}`
    }));
    const record = podcastTranscriptStore.create({
      record: { fileName: 'range.wav', text: '跨范围', contentMode: 'podcast', structureStatus: 'ready' },
      transcript: {
        speakers: [{ speakerKey: 'speaker-0001', displayName: '说话人 1', sortOrder: 0, speakerScope: 'global' }],
        segments,
        turns: [
          { turnIndex: 0, speakerKey: 'speaker-0001', startSeconds: 0, endSeconds: 5, text: '片段 0', evidenceSegmentIndexes: [0] },
          { turnIndex: 1, speakerKey: 'speaker-0001', startSeconds: 30, endSeconds: 35, text: '片段 3', evidenceSegmentIndexes: [3] }
        ]
      }
    });
    const generateText = jest.fn()
      .mockResolvedValueOnce(JSON.stringify({
        digest: '两端事实',
        claims: [
          { content: '开头', speaker_key: 'speaker-0001', evidence_start_index: 0, evidence_end_index: 0 },
          { content: '结尾', speaker_key: 'speaker-0001', evidence_start_index: 3, evidence_end_index: 3 }
        ]
      }))
      .mockResolvedValueOnce(JSON.stringify({
        one_liner: '跨越完整讨论',
        overview: '从开头到结尾。',
        chapters: [{ title: '完整章节', content: '连接两端事实。', evidence_start_index: 0, evidence_end_index: 3 }],
        speaker_viewpoints: [],
        highlights: []
      }));

    const detail = await transcriptionSummaryService.generate({ transcriptionId: record.id, generateText, model: 'test-model' });
    const chapter = detail.summaryItems.find((item) => item.item_type === 'chapter');
    expect(chapter).toMatchObject({ start_seconds: 0, end_seconds: 35 });
  });

  test('模型偶发返回损坏 JSON 时只重试格式，不放宽证据校验', async () => {
    const transcriptionSummaryService = require('../../src/services/transcriptionSummaryService');
    const record = podcastTranscriptStore.create({
      record: { fileName: 'retry.wav', text: '事实', contentMode: 'podcast', structureStatus: 'ready' },
      transcript: {
        speakers: [{ speakerKey: 'speaker-0001', displayName: '说话人 1', sortOrder: 0, speakerScope: 'global' }],
        segments: [{ sourceIndex: 0, segmentIndex: 0, speakerKey: 'speaker-0001', startSeconds: 0, endSeconds: 2, text: '事实' }],
        turns: [{ turnIndex: 0, speakerKey: 'speaker-0001', startSeconds: 0, endSeconds: 2, text: '事实', evidenceSegmentIndexes: [0] }]
      }
    });
    const generateText = jest.fn()
      .mockResolvedValueOnce('{"digest": 损坏}')
      .mockResolvedValueOnce(JSON.stringify({
        digest: '有效笔记',
        claims: [{ content: '事实', speaker_key: 'speaker-0001', evidence_start_index: 0, evidence_end_index: 0 }]
      }))
      .mockResolvedValueOnce(JSON.stringify({
        one_liner: '有效摘要', overview: '只有事实。',
        chapters: [{ title: '事实', content: '事实', evidence_start_index: 0, evidence_end_index: 0 }],
        speaker_viewpoints: [], highlights: []
      }));

    const detail = await transcriptionSummaryService.generate({ transcriptionId: record.id, generateText, model: 'test-model' });
    expect(detail.record.summary_status).toBe('completed');
    expect(generateText).toHaveBeenCalledTimes(3);
    expect(generateText.mock.calls[1][0].prompt).toContain('修复下面这个语法损坏的 JSON');
    expect(generateText.mock.calls[1][0].prompt).toContain('{"digest": 损坏}');
  });
});
