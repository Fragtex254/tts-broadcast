const audio = require('./audio');

function pad(value, length = 2) {
  return String(value).padStart(length, '0');
}

function formatTimestamp(seconds, separator) {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMilliseconds / 3600000);
  const minutes = Math.floor((totalMilliseconds % 3600000) / 60000);
  const secs = Math.floor((totalMilliseconds % 60000) / 1000);
  const milliseconds = totalMilliseconds % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}${separator}${pad(milliseconds, 3)}`;
}

function splitSubtitleText(text, maxLength = 22) {
  const source = String(text || '').replace(/\s+/g, '').trim();
  if (!source) return [];
  const clauses = source.match(/[^，。！？；：,.!?;:]+[，。！？；：,.!?;:]?/g) || [source];
  const result = [];
  let current = '';
  for (const clause of clauses) {
    if (current && current.length + clause.length > maxLength) {
      result.push(current);
      current = '';
    }
    if (clause.length > maxLength) {
      if (current) result.push(current);
      for (let index = 0; index < clause.length; index += maxLength) {
        result.push(clause.slice(index, index + maxLength));
      }
    } else {
      current += clause;
    }
  }
  if (current) result.push(current);
  return result.filter(Boolean);
}

function createSubtitleCues(segments) {
  const cues = [];
  let cursor = 0;
  for (const segment of segments) {
    const duration = audio.getWavDurationSeconds({
      audioPath: segment.audio_path,
      playbackRate: segment.playback_rate || 1,
    });
    const parts = splitSubtitleText(segment.text);
    const totalCharacters = parts.reduce((sum, part) => sum + part.length, 0) || 1;
    let segmentCursor = cursor;
    for (const part of parts) {
      const partDuration = duration * (part.length / totalCharacters);
      cues.push({ start: segmentCursor, end: segmentCursor + partDuration, text: part });
      segmentCursor += partDuration;
    }
    cursor += duration;
  }
  return cues;
}

function buildSrt(cues) {
  return cues.map((cue, index) => [
    index + 1,
    `${formatTimestamp(cue.start, ',')} --> ${formatTimestamp(cue.end, ',')}`,
    cue.text,
  ].join('\n')).join('\n\n');
}

function buildVtt(cues) {
  const body = cues.map((cue) => [
    `${formatTimestamp(cue.start, '.')} --> ${formatTimestamp(cue.end, '.')}`,
    cue.text,
  ].join('\n')).join('\n\n');
  return `WEBVTT\n\n${body}`;
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * 构建发布包中的文本资产。
 * @param {Object} params
 * @param {Object} params.broadcast - 播报记录
 * @param {Array} params.segments - 分段列表
 * @returns {Object} 发布包资产
 */
function buildPublishAssets({ broadcast, segments }) {
  const metadata = parseJsonObject(broadcast.publish_metadata);
  const template = parseJsonObject(broadcast.template_snapshot);
  const completeSegments = segments.filter((segment) => segment.status === 'generated' && segment.audio_path);
  const canCreateSubtitles = broadcast.mode === 'segmented'
    && segments.length > 0
    && completeSegments.length === segments.length;
  const cues = canCreateSubtitles ? createSubtitleCues(completeSegments) : [];
  const tags = Array.isArray(metadata.tags) ? metadata.tags : [];
  const alternativeTitles = Array.isArray(metadata.alternativeTitles) ? metadata.alternativeTitles : [];
  const primaryTitle = metadata.primaryTitle || broadcast.title;
  const scriptMarkdown = `# ${primaryTitle}\n\n${broadcast.content}\n`;
  const publishMarkdown = `# 发布信息\n\n## 主标题\n\n${primaryTitle}\n\n## 备选标题\n\n${alternativeTitles.map((title) => `- ${title}`).join('\n') || '- 暂无'}\n\n## 内容简介\n\n${metadata.summary || ''}\n\n## 发布文案\n\n${metadata.publishCopy || ''}\n\n## 标签\n\n${tags.map((tag) => `#${tag}`).join(' ')}\n`;

  return {
    metadata: { ...metadata, primaryTitle, alternativeTitles, tags },
    template,
    scriptMarkdown,
    scriptText: broadcast.content,
    publishMarkdown,
    srt: cues.length > 0 ? buildSrt(cues) : null,
    vtt: cues.length > 0 ? buildVtt(cues) : null,
    subtitleStatus: cues.length > 0 ? 'ready' : broadcast.mode === 'whole' ? 'whole-mode' : 'audio-incomplete',
  };
}

/**
 * 获取播报音频并转换为 MP3。
 * @param {Object} params
 * @param {Object} params.broadcast - 播报记录
 * @param {Array} params.segments - 分段列表
 * @returns {Promise<Buffer>} MP3 音频
 */
async function buildPublishAudio({ broadcast, segments }) {
  let buffer;
  if (broadcast.mode === 'segmented') {
    if (segments.length === 0 || segments.some((segment) => segment.status !== 'generated' || !segment.audio_path)) {
      throw new Error('还有分段音频未生成，暂时不能导出发布音频');
    }
    buffer = await audio.mergeSegmentAudioWithRates(segments);
  } else {
    if (!broadcast.audio_path) throw new Error('音频文件不存在');
    buffer = audio.readAudioFile(broadcast.audio_path);
  }
  return audio.transcodeAudioBufferToMp3({ buffer });
}

module.exports = { buildPublishAssets, buildPublishAudio, splitSubtitleText };
