// 分段语气标签清单（新闻向精选）与清洗
// 整体风格标签：放在该段文本最开头，包成 (风格)
export const STYLE_TAGS = ['平静', '严肃', '活泼', '深沉', '温柔', '干练', '惊讶', '兴奋'];

// 细粒度音频标签：插入文本任意位置，包成 [标签]
export const AUDIO_TAGS = ['停顿', '吸气', '叹气', '轻笑', '深呼吸'];

export function sanitizeStyleTag(raw: string): string {
  return (raw ?? '').replace(/[()（）[\]]/g, '').trim().slice(0, 20);
}

export function sanitizeAudioTag(raw: string): string {
  return (raw ?? '').replace(/[[\]]/g, '').trim().slice(0, 20);
}
