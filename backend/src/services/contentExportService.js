function timeRange(claim) {
  const format = (seconds) => {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };
  return `${format(claim.start_seconds)}–${format(claim.end_seconds)}`;
}

function citation(claim) {
  const parts = [claim.podcast_name || '未填写播客名', claim.episode_title || '未填写单集标题', claim.speaker_name || claim.speaker_key, timeRange(claim)];
  if (claim.source_url) parts.push(claim.source_url);
  return `- ${parts.join('｜')}`;
}

function claimBlocks(project) {
  if (!project.claims.length) return '（尚未选择观点，可稍后补充）';
  return project.claims.map((item, index) => `${index + 1}. **${item.claim.claim}**\n   - 问题：${item.claim.question}\n   - 理由：${item.claim.reasoning || '逐字稿未提供额外理由'}\n   - 证据：${item.claim.evidence_excerpt}\n   - 使用备注：${item.usage_note || '—'}`).join('\n\n');
}

/**
 * 按目标平台导出内容项目草稿，缺失字段保留可编辑占位提示
 * @param {Object} params
 * @param {Object} params.project - 内容项目及已选观点
 * @param {string} params.platform - 目标平台
 * @returns {string} Markdown 草稿
 */
function exportProject({ project, platform }) {
  const sources = project.claims.length ? project.claims.map((item) => citation(item.claim)).join('\n') : '- （尚未补充播客来源）';
  const claims = claimBlocks(project);
  const fallbackQuestion = project.claims[0]?.claim.question || '（请补充要讨论的问题）';
  if (platform === 'xiaohongshu') {
    const reasons = project.claims.length ? project.claims.map((item) => `- ${item.claim.reasoning || item.claim.evidence_excerpt}`).join('\n') : '（尚未补充嘉宾理由）';
    return `# 标题候选\n\n- ${project.title}\n- ${project.thesis || project.discussion_question || project.topic || '这件事值得讨论吗？'}\n\n## 这期播客讨论的问题\n\n${project.topic || fallbackQuestion}\n\n## 最值得讨论的一句话\n\n${project.thesis || '（请补充最值得讨论的一句话）'}\n\n## 相关观点与证据\n\n${claims}\n\n## 嘉宾使用的理由\n\n${reasons}\n\n## 我认同或质疑的地方\n\n${project.personal_judgment || '（请补充个人判断）'}\n\n## 对普通人的影响\n\n${project.personal_practice || '（请补充个人实践）'}\n\n## 具体讨论问题\n\n${project.discussion_question || '（请补充准备向读者提出的问题）'}\n\n## 引用来源\n\n${sources}`;
  }
  if (platform === 'wechat') {
    return `# 文章标题候选\n\n- ${project.title}\n- ${project.thesis || project.topic || '（请补充核心主张）'}\n\n## 问题背景\n\n${project.topic || fallbackQuestion}\n\n## 多期播客中的共识\n\n${project.thesis || '（请补充多期播客的共识）'}\n\n## 相关观点与证据\n\n${claims}\n\n## 主要分歧、成立条件与阶段性判断\n\n${project.personal_judgment || '（请补充主要分歧、成立条件与阶段性判断）'}\n\n## 我的个人实践\n\n${project.personal_practice || '（请补充）'}\n\n## 仍未解决的问题\n\n${project.discussion_question || '（请补充）'}\n\n## 引用来源清单\n\n${sources}`;
  }
  throw new Error('当前仅支持导出小红书或微信公众号结构');
}

module.exports = { citation, exportProject };
