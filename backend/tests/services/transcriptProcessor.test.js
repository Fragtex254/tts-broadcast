const transcriptProcessor = require('../../src/services/transcriptProcessor');

describe('Transcript 阅读层处理器', () => {
  test('只在同一说话人的重叠片段中去除完全重复文本，原始事实全部保留', () => {
    const transcript = transcriptProcessor.processTranscript({
      speakerScope: 'mixed',
      segments: [
        { start: 0, end: 2, speaker: 'speaker-0001', text: '同一句话' },
        { start: 1.5, end: 2.5, speaker: 'speaker-0001', text: '同一句话' },
        { start: 1.8, end: 3, speaker: 'speaker-0002', text: '同一句话' },
        { start: 3.2, end: 4, speaker: 'speaker-0002', text: '嗯' }
      ]
    });

    expect(transcript.segments).toHaveLength(4);
    expect(transcript.segments.map((segment) => segment.sourceIndex)).toEqual([0, 1, 2, 3]);
    expect(transcript.turns).toHaveLength(2);
    expect(transcript.turns[0]).toMatchObject({
      speakerKey: 'speaker-0001',
      text: '同一句话',
      evidenceSegmentIndexes: [0]
    });
    expect(transcript.turns[1]).toMatchObject({
      speakerKey: 'speaker-0002',
      text: '同一句话\n嗯',
      evidenceSegmentIndexes: [2, 3]
    });
  });

  test('丢弃无效时间片段并保持 mixed scope，不把局部标签伪装成全局说话人', () => {
    const transcript = transcriptProcessor.processTranscript({
      speakerScope: 'mixed',
      segments: [
        { start: -1, end: 2, speaker: 'S01', text: '无效' },
        { start: 4, end: 3, speaker: 'S01', text: '倒序' },
        { start: 0, end: 2, speaker: 'chunk-0000:S01', text: '有效' }
      ]
    });

    expect(transcript.segments).toHaveLength(1);
    expect(transcript.speakers[0]).toMatchObject({
      speakerKey: 'chunk-0000:S01',
      speakerScope: 'mixed'
    });
  });
});
