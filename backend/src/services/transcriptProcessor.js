const DEFAULT_TURN_GAP_SECONDS = 2.5;
const DEFAULT_MAX_TURN_CHARS = 1200;

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeComparableText(text) {
  return String(text || '').replace(/\s+/g, '').trim();
}

/**
 * 将 ASR 原始片段规范为稳定的事实记录，不改写片段文本。
 * @param {Object} params
 * @param {Object[]} params.segments - ASR 原始 segments
 * @param {string} [params.defaultSpeakerScope] - 顶层 speaker scope
 * @returns {Object[]} 规范化片段
 */
function normalizeSegments({ segments, defaultSpeakerScope = '' }) {
  if (!Array.isArray(segments)) return [];

  return segments
    .map((segment, sourceIndex) => {
      const start = finiteNumber(segment?.start);
      const end = finiteNumber(segment?.end);
      const text = typeof segment?.text === 'string' ? segment.text.trim() : '';
      if (start === null || end === null || start < 0 || end < start || !text) return null;
      const speakerKey = typeof segment.speaker === 'string' && segment.speaker.trim()
        ? segment.speaker.trim()
        : 'speaker-unknown';
      return {
        sourceIndex,
        speakerKey,
        sourceSpeaker: typeof segment.source_speaker === 'string' ? segment.source_speaker : '',
        speakerScope: typeof segment.speaker_scope === 'string' ? segment.speaker_scope : defaultSpeakerScope,
        speakerResolution: typeof segment.resolution === 'string'
          ? segment.resolution
          : (typeof segment.speaker_resolution === 'string' ? segment.speaker_resolution : ''),
        chunkIndex: Number.isInteger(segment.chunk_index) ? segment.chunk_index : -1,
        startSeconds: start,
        endSeconds: end,
        text
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.sourceIndex - right.sourceIndex)
    .map((segment, segmentIndex) => ({ ...segment, segmentIndex }));
}

/**
 * 从规范化片段提取 Transcript 内稳定的匿名 Speaker。
 * @param {Object[]} segments - 规范化片段
 * @returns {Object[]} Speaker 列表
 */
function buildSpeakers(segments) {
  const seen = new Map();
  for (const segment of segments) {
    if (!seen.has(segment.speakerKey)) {
      const sortOrder = seen.size;
      seen.set(segment.speakerKey, {
        speakerKey: segment.speakerKey,
        displayName: segment.speakerKey === 'speaker-unknown' ? '待确认说话人' : `说话人 ${sortOrder + 1}`,
        sortOrder,
        speakerScope: segment.speakerScope
      });
    }
  }
  return Array.from(seen.values());
}

function isExactOverlapDuplicate(previous, segment) {
  if (!previous) return false;
  if (previous.speakerKey !== segment.speakerKey) return false;
  if (normalizeComparableText(previous.text) !== normalizeComparableText(segment.text)) return false;
  return segment.startSeconds <= previous.endSeconds;
}

/**
 * 将相邻同 Speaker 片段合并为阅读轮次；重复片段只从派生 Turn 中去除，原始 Segment 保留。
 * @param {Object} params
 * @param {Object[]} params.segments - 规范化片段
 * @param {number} [params.maxGapSeconds] - 同说话人最大合并间隔
 * @param {number} [params.maxTurnChars] - 单轮次最大字符数
 * @returns {Object[]} 阅读轮次
 */
function buildTurns({
  segments,
  maxGapSeconds = DEFAULT_TURN_GAP_SECONDS,
  maxTurnChars = DEFAULT_MAX_TURN_CHARS
}) {
  const turns = [];
  let previousAccepted = null;

  for (const segment of segments) {
    if (isExactOverlapDuplicate(previousAccepted, segment)) continue;
    previousAccepted = segment;
    const current = turns[turns.length - 1];
    const canMerge = current
      && current.speakerKey === segment.speakerKey
      && segment.startSeconds - current.endSeconds <= maxGapSeconds
      && current.text.length + segment.text.length + 1 <= maxTurnChars;

    if (canMerge) {
      current.endSeconds = Math.max(current.endSeconds, segment.endSeconds);
      current.text = `${current.text}\n${segment.text}`;
      current.evidenceSegmentIndexes.push(segment.segmentIndex);
      continue;
    }

    turns.push({
      turnIndex: turns.length,
      speakerKey: segment.speakerKey,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      text: segment.text,
      evidenceSegmentIndexes: [segment.segmentIndex]
    });
  }

  return turns;
}

/**
 * 构建可持久化的 Transcript 事实与阅读层。
 * @param {Object} params
 * @param {Object[]} params.segments - ASR 原始 segments
 * @param {string} [params.speakerScope] - 顶层 speaker scope
 * @returns {{segments:Object[],speakers:Object[],turns:Object[]}}
 */
function processTranscript({ segments, speakerScope = '' }) {
  const normalizedSegments = normalizeSegments({ segments, defaultSpeakerScope: speakerScope });
  return {
    segments: normalizedSegments,
    speakers: buildSpeakers(normalizedSegments),
    turns: buildTurns({ segments: normalizedSegments })
  };
}

module.exports = {
  buildSpeakers,
  buildTurns,
  normalizeSegments,
  processTranscript
};
