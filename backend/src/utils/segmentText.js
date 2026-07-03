// segment 合成文本组装：整体风格/情绪提示清洗与前置
const MAX_SEGMENT_TEXT_LENGTH = 1024;
const MAX_STYLE_TAG_LENGTH = 80;

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

module.exports = {
  MAX_SEGMENT_TEXT_LENGTH,
  MAX_STYLE_TAG_LENGTH,
  sanitizeStyleTag,
  prependStyleTag,
  splitLongTextByLimit,
  normalizeSegmentTexts
};
