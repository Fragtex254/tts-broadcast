const crypto = require('crypto');

const DEFAULT_FRAGMENT_MAX_LENGTH = 800;

const NATURAL_BOUNDARIES = new Set([
  '\n', '\r', '。', '！', '？', '；', '：', '.', '!', '?', ';', ':', '，', ',',
]);

function isWhitespace(character) {
  return /\s/u.test(character || '');
}

function safeBoundary(content, index) {
  if (index <= 0 || index >= content.length) return index;
  const current = content.charCodeAt(index);
  const previous = content.charCodeAt(index - 1);
  if (current >= 0xDC00 && current <= 0xDFFF && previous >= 0xD800 && previous <= 0xDBFF) {
    return index - 1;
  }
  return index;
}

function findFragmentEnd(content, start, maxLength) {
  const hardEnd = safeBoundary(content, Math.min(content.length, start + maxLength));
  if (hardEnd >= content.length) return content.length;

  const earliestNaturalBoundary = start + Math.max(1, Math.floor(maxLength * 0.5));
  for (let index = hardEnd - 1; index >= earliestNaturalBoundary; index--) {
    if (NATURAL_BOUNDARIES.has(content[index])) return safeBoundary(content, index + 1);
  }
  return hardEnd;
}

/**
 * 把不可变来源正文切成可由 offset 原样回查的确定性片段。
 * @param {string} content - 原始来源正文
 * @param {Object} [options]
 * @param {number} [options.maxLength] - 单片最大 UTF-16 长度
 * @returns {Array<{index:number,start_offset:number,end_offset:number,text:string}>} 来源片段
 */
function createSourceFragments(content, { maxLength = DEFAULT_FRAGMENT_MAX_LENGTH } = {}) {
  if (typeof content !== 'string') throw new Error('来源正文必须是字符串');
  if (!Number.isInteger(maxLength) || maxLength < 8 || maxLength > 10000) {
    throw new Error('来源分片长度无效');
  }

  const fragments = [];
  let cursor = 0;
  while (cursor < content.length) {
    while (cursor < content.length && isWhitespace(content[cursor])) cursor++;
    if (cursor >= content.length) break;

    const splitEnd = findFragmentEnd(content, cursor, maxLength);
    let end = splitEnd;
    while (end > cursor && isWhitespace(content[end - 1])) end--;
    if (end > cursor) {
      fragments.push({
        index: fragments.length,
        start_offset: cursor,
        end_offset: end,
        text: content.slice(cursor, end),
      });
    }
    cursor = Math.max(splitEnd, cursor + 1);
  }
  return fragments;
}

function hashSourceContent(content) {
  return crypto.createHash('sha256').update(String(content || ''), 'utf8').digest('hex');
}

module.exports = { DEFAULT_FRAGMENT_MAX_LENGTH, createSourceFragments, hashSourceContent };
