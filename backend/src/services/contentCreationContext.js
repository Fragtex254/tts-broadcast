const db = require('../db');
const contentArtifactStore = require('./contentArtifactStore');
const contentEvidenceStore = require('./contentEvidenceStore');
const contentSourceStore = require('./contentSourceStore');
const mimo = require('./mimo');
const { createSourceFragments, hashSourceContent } = require('../utils/contentSourceFragments');

const PROMPT_VERSION = 'evidence-creation-v2';
const OPERATIONS = new Set(['extract_evidence', 'generate_outline', 'generate_master']);
const CREATOR_INPUT_KEYS = new Set(['personal_practice', 'personal_judgment']);

function businessError(message, code = 'VALIDATION_ERROR') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeIds(value, label, { required = true, max = 200 } = {}) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.length === 0) throw businessError(`请明确选择${label}`);
  if (value.length > max || value.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw businessError(`${label}无效或数量过多`);
  }
  const ids = [...new Set(value)].sort((a, b) => a - b);
  if (ids.length !== value.length) throw businessError(`${label}不能重复`);
  return ids;
}

function normalizeCreatorKeys(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some((key) => typeof key !== 'string' || !CREATOR_INPUT_KEYS.has(key))) {
    throw businessError('创作者输入只支持个人实践与个人判断');
  }
  const keys = [...new Set(value)].sort();
  if (keys.length !== value.length) throw businessError('创作者输入字段不能重复');
  return keys;
}

function projectBrief(project) {
  return {
    title: project.title,
    topic: project.topic,
    target_platform: project.target_platform,
    thesis: project.thesis,
    audience: project.audience,
    goal: project.goal,
    angle: project.angle,
    tone: project.tone,
    content_format: project.content_format,
    discussion_question: project.discussion_question,
  };
}

function build({ projectId, operation, input = {} }) {
  if (!OPERATIONS.has(operation)) throw businessError('创作任务类型无效');
  const project = db.prepare('SELECT * FROM content_projects WHERE id = ?').get(projectId);
  if (!project) throw businessError('内容项目不存在', 'NOT_FOUND');

  const creatorInputKeys = operation === 'extract_evidence'
    ? []
    : normalizeCreatorKeys(input.creatorInputKeys);
  const creatorInputs = {};
  for (const key of creatorInputKeys) {
    const value = String(project[key] || '');
    if (!value.trim()) throw businessError(`已选择的创作者输入“${key}”为空，请先填写或取消选择`);
    if (value.includes('[证据#')) {
      throw businessError(`创作者输入“${key}”包含保留的 [证据#ID] 语法，请先改写或取消选择`);
    }
    creatorInputs[key] = value;
  }

  let sourceIds = [];
  let sources = [];
  let evidenceIds = [];
  let evidence = [];
  let outlineRevisionId = null;
  let outline = null;

  if (operation === 'extract_evidence') {
    sourceIds = normalizeIds(input.sourceIds, '要外发分析的来源', { max: 20 });
    sources = sourceIds.map((sourceId) => {
      const source = contentSourceStore.getForProject({ projectId, sourceId });
      if (!source) throw businessError(`来源 #${sourceId} 不存在或已移出项目`, 'CONTEXT_CHANGED');
      if (!source.content.trim()) throw businessError(`来源 #${sourceId} 没有可分析的原文`, 'VALIDATION_ERROR');
      const actualHash = hashSourceContent(source.content);
      if (actualHash !== source.content_sha256) {
        throw businessError(`来源 #${sourceId} 原文快照已变化`, 'CONTEXT_CHANGED');
      }
      return {
        id: source.id,
        title: source.title,
        content_sha256: source.content_sha256,
        content_length: source.content.length,
        fragment_count: createSourceFragments(source.content).length,
      };
    });
  } else {
    evidenceIds = normalizeIds(input.evidenceIds, '用于写作的证据', { max: 100 });
    evidence = evidenceIds.map((evidenceId) => {
      const card = contentEvidenceStore.getForProject({ projectId, evidenceId });
      if (!card) throw businessError(`证据 #${evidenceId} 不存在`, 'CONTEXT_CHANGED');
      if (!card.reuse_eligible) {
        throw businessError(`证据 #${evidenceId} 当前不可用于新稿：${card.unavailable_reason}`, 'CONTEXT_CHANGED');
      }
      if (card.excerpt.includes('[证据#')) {
        throw businessError(`证据 #${evidenceId} 包含保留的 [证据#ID] 语法，请修正证据边界`);
      }
      return {
        id: card.id,
        source_id: card.source_id,
        source_content_sha256: card.source_content_sha256,
        start_fragment_index: card.start_fragment_index,
        end_fragment_index: card.end_fragment_index,
        excerpt: card.excerpt,
      };
    });
  }

  if (operation === 'generate_master') {
    if (!Number.isInteger(input.outlineRevisionId) || input.outlineRevisionId <= 0) {
      throw businessError('生成主稿必须明确选择一个提纲 Revision');
    }
    outlineRevisionId = input.outlineRevisionId;
    const context = contentArtifactStore.getRevisionContext({ revisionId: outlineRevisionId });
    if (!context || context.artifact.project_id !== projectId || context.artifact.kind !== 'outline') {
      throw businessError('提纲 Revision 不存在或不属于当前项目', 'CONTEXT_CHANGED');
    }
    if (!context.revision.content.trim()) throw businessError('所选提纲 Revision 为空');
    outline = {
      revision_id: context.revision.id,
      artifact_id: context.artifact.id,
      content_sha256: hashSourceContent(context.revision.content),
    };
  }

  const snapshot = {
    prompt_version: PROMPT_VERSION,
    operation,
    request: {
      source_ids: sourceIds,
      evidence_ids: evidenceIds,
      outline_revision_id: outlineRevisionId,
      creator_input_keys: creatorInputKeys,
    },
    brief: projectBrief(project),
    creator_inputs: creatorInputs,
    sources,
    evidence,
    outline,
    llm: (() => {
      const config = mimo.getLlmConfig();
      return { provider: config.apiFormat, model: config.model, base_url: config.baseUrl };
    })(),
  };
  return {
    snapshot,
    inputSha256: hashSourceContent(JSON.stringify(snapshot)),
  };
}

module.exports = {
  CREATOR_INPUT_KEYS,
  OPERATIONS,
  PROMPT_VERSION,
  build,
};
