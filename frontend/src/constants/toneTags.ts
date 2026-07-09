// 分段语气标签清单（新闻向精选）与清洗
// 整体风格/情绪提示：放在该段文本最开头，包成 (提示)
export const STYLE_TAGS = ['平静', '严肃', '活泼', '深沉', '温柔', '干练', '惊讶', '兴奋'];

export const MAX_STYLE_TAG_LENGTH = 80;

export function sanitizeStyleTag(raw: string): string {
  return (raw ?? '').replace(/[()（）]/g, '').trim().slice(0, MAX_STYLE_TAG_LENGTH);
}
