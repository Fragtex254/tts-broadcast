// segment 合成文本组装：整体风格标签清洗与前置
function sanitizeStyleTag(raw) {
  return String(raw || '').replace(/[()（）]/g, '').trim().slice(0, 20);
}

function prependStyleTag(text, styleTag) {
  const tag = sanitizeStyleTag(styleTag);
  return tag ? `(${tag})${text}` : text;
}

module.exports = { sanitizeStyleTag, prependStyleTag };
