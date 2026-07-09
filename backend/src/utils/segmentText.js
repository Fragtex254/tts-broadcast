// segment 合成文本组装：整体风格/情绪提示清洗与前置
const MAX_SEGMENT_TEXT_LENGTH = 1024;
const AUTO_SEGMENT_MIN_LENGTH = 100;
const AUTO_SEGMENT_MAX_LENGTH = 200;
const MAX_STYLE_TAG_LENGTH = 80;
const STRONG_BOUNDARY_PATTERN = /(?<=[。！？!?；;])\s*|\n+/u;
const NATURAL_BOUNDARY_CHARS = new Set(['。', '！', '？', '!', '?', '；', ';', '，', ',', '、', '：', ':']);

function sanitizeStyleTag(raw) {
  return String(raw || '').replace(/[()（）]/g, '').trim().slice(0, MAX_STYLE_TAG_LENGTH);
}

function prependStyleTag(text, styleTag) {
  const tag = sanitizeStyleTag(styleTag);
  return tag ? `(${tag})${text}` : text;
}

function splitLongTextByLimit(text, maxLength = MAX_SEGMENT_TEXT_LENGTH) {
  const value = String(text || '').trim();
  if (!value) return [];
  if (value.length <= maxLength) return [value];

  const chunks = [];
  let current = '';
  const pieces = value
    .split(/(?<=[。！？!?；;])\s*|\n+/)
    .map((piece) => piece.trim())
    .filter(Boolean);

  for (const piece of pieces.length ? pieces : [value]) {
    if (piece.length > maxLength) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < piece.length; i += maxLength) {
        chunks.push(piece.slice(i, i + maxLength));
      }
      continue;
    }

    const next = current ? `${current}${piece}` : piece;
    if (next.length <= maxLength) {
      current = next;
    } else {
      if (current) chunks.push(current);
      current = piece;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function normalizeSegmentTexts(texts, maxLength = MAX_SEGMENT_TEXT_LENGTH) {
  if (!Array.isArray(texts)) return [];
  return texts.flatMap((text) => splitLongTextByLimit(text, maxLength));
}

function splitIntoNaturalPieces(text, maxLength) {
  const value = String(text || '').trim();
  if (!value) return [];

  return value
    .split(STRONG_BOUNDARY_PATTERN)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .flatMap((piece) => splitLongPieceForAutoSegment(piece, maxLength));
}

function splitLongPieceForAutoSegment(text, maxLength) {
  const chunks = [];
  let remaining = String(text || '').trim();

  while (remaining.length > maxLength) {
    const splitAt = findLastNaturalBoundary(remaining, Math.floor(maxLength * 0.45), maxLength) || maxLength;
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

function findLastNaturalBoundary(text, minIndex, maxIndex) {
  const upper = Math.min(maxIndex, text.length);
  const lower = Math.max(0, minIndex);
  for (let index = upper - 1; index >= lower; index -= 1) {
    if (NATURAL_BOUNDARY_CHARS.has(text[index]) || /\s/u.test(text[index])) {
      return index + 1;
    }
  }
  return 0;
}

function findNearestNaturalBoundary(text, minIndex, maxIndex, preferredIndex) {
  const upper = Math.min(maxIndex, text.length);
  const lower = Math.max(0, minIndex);
  const preferred = Math.min(Math.max(preferredIndex, lower), upper);

  for (let offset = 0; offset <= upper - lower; offset += 1) {
    const left = preferred - offset;
    if (left >= lower && left < upper && (NATURAL_BOUNDARY_CHARS.has(text[left]) || /\s/u.test(text[left]))) {
      return left + 1;
    }

    const right = preferred + offset;
    if (right >= lower && right < upper && (NATURAL_BOUNDARY_CHARS.has(text[right]) || /\s/u.test(text[right]))) {
      return right + 1;
    }
  }

  return preferred;
}

function splitShortTailWithPrevious(previous, tail, minLength, maxLength) {
  const combined = `${previous}${tail}`;
  if (combined.length <= maxLength) return [combined];

  const minSplit = Math.max(minLength, combined.length - maxLength);
  const maxSplit = Math.min(maxLength, combined.length - minLength);
  if (minSplit > maxSplit) return [previous, tail];

  const splitAt = findNearestNaturalBoundary(
    combined,
    minSplit,
    maxSplit,
    Math.round(combined.length / 2)
  );
  return [
    combined.slice(0, splitAt).trim(),
    combined.slice(splitAt).trim(),
  ].filter(Boolean);
}

function rebalanceShortTail(segments, minLength, maxLength) {
  if (segments.length <= 1) return segments;
  const result = [...segments];
  const tail = result[result.length - 1];
  if (tail.length >= minLength) return result;

  const previous = result[result.length - 2];
  result.splice(result.length - 2, 2, ...splitShortTailWithPrevious(previous, tail, minLength, maxLength));
  return result;
}

/**
 * 将 AI 粗切结果规整为自动 TTS 切分文段。
 * 目标是稳定产出 100-200 字的文段；当总文本本身不足 100 字时保留一个短段。
 * @param {string[]} texts - AI 返回或本地兜底得到的候选片段
 * @param {Object} [options]
 * @param {number} [options.minLength] - 自动切分目标最小字数
 * @param {number} [options.maxLength] - 自动切分目标最大字数
 * @returns {string[]} 规整后的文段
 */
function normalizeAutoSegmentTexts(texts, options = {}) {
  if (!Array.isArray(texts)) return [];

  const minLength = options.minLength || AUTO_SEGMENT_MIN_LENGTH;
  const maxLength = options.maxLength || AUTO_SEGMENT_MAX_LENGTH;
  if (!Number.isInteger(minLength) || !Number.isInteger(maxLength) || minLength <= 0 || maxLength < minLength) {
    throw new Error('自动切分长度配置无效');
  }

  const pieces = texts.flatMap((text) => splitIntoNaturalPieces(text, maxLength));
  const segments = [];
  let current = '';
  let index = 0;

  while (index < pieces.length) {
    const piece = pieces[index];
    if (!current) {
      current = piece;
      index += 1;
      continue;
    }

    const next = `${current}${piece}`;
    if (next.length <= maxLength) {
      current = next;
      index += 1;
      continue;
    }

    if (current.length < minLength) {
      const capacity = maxLength - current.length;
      const minFill = minLength - current.length;
      const splitAt = findLastNaturalBoundary(piece, minFill, capacity) || capacity;
      if (splitAt > 0 && splitAt < piece.length) {
        current = `${current}${piece.slice(0, splitAt).trim()}`;
        const remaining = piece.slice(splitAt).trim();
        segments.push(current);
        current = '';
        pieces[index] = remaining;
        continue;
      }
    }

    segments.push(current);
    current = '';
  }

  if (current) segments.push(current);
  return rebalanceShortTail(segments, minLength, maxLength)
    .flatMap((segment) => splitLongPieceForAutoSegment(segment, maxLength))
    .filter(Boolean);
}

module.exports = {
  MAX_SEGMENT_TEXT_LENGTH,
  AUTO_SEGMENT_MIN_LENGTH,
  AUTO_SEGMENT_MAX_LENGTH,
  MAX_STYLE_TAG_LENGTH,
  sanitizeStyleTag,
  prependStyleTag,
  splitLongTextByLimit,
  normalizeSegmentTexts,
  normalizeAutoSegmentTexts
};
