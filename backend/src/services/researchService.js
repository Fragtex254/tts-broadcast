const mimo = require('./mimo');
const embeddingService = require('./embeddingService');
const researchStore = require('./researchStore');

const RELATION_TYPES = new Set(['support', 'oppose', 'complement', 'different_scope', 'similar_example', 'unrelated']);

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || !a.length) return 0;
  let dot = 0; let normA = 0; let normB = 0;
  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index]; normA += a[index] ** 2; normB += b[index] ** 2;
  }
  return normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0;
}

function keywordScore(query, claim) {
  const normalized = query.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const tokens = [...new Set([normalized, ...normalized.split(/\s+/), ...(normalized.match(/[\p{Script=Han}]{2,}/gu) || [])].filter((token) => token.length >= 2))];
  if (!tokens.length) return 0;
  const haystack = [claim.question, claim.claim, claim.reasoning, ...(claim.topic_tags || [])].join(' ').toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? token.length : 0), 0) / tokens.reduce((sum, token) => sum + token.length, 0);
}

async function searchClaims({ query, limit = 20, offset = 0, embedText = embeddingService.embedText }) {
  const claims = researchStore.listClaims({ status: 'active' });
  let queryEmbedding = null;
  try { queryEmbedding = await embedText({ text: query }); } catch { queryEmbedding = null; }
  const matched = claims.map((claim) => ({
    claim,
    similarity: queryEmbedding && Array.isArray(claim.embedding)
      ? cosineSimilarity(queryEmbedding, claim.embedding)
      : keywordScore(query, claim),
    search_mode: queryEmbedding && Array.isArray(claim.embedding) ? 'embedding' : 'keyword',
  })).filter((item) => item.similarity > 0).sort((a, b) => b.similarity - a.similarity || b.claim.content_value - a.claim.content_value);
  return { items: matched.slice(offset, offset + limit), total: matched.length };
}

function parseJson(raw) {
  let text = String(raw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) text = text.slice(start, end + 1);
  try { return JSON.parse(text); } catch { throw new Error('观点关系分析结果解析失败'); }
}

async function analyzeRelations({ claimIds, generateText = mimo.createLlmMessage, model = mimo.getLlmConfig().model }) {
  const uniqueIds = [...new Set(claimIds)];
  if (uniqueIds.length < 2 || uniqueIds.length > 10) throw new Error('请选择 2–10 条候选观点');
  const claims = uniqueIds.map((id) => researchStore.getClaim(id));
  if (claims.some((claim) => !claim || claim.status !== 'active')) throw new Error('包含不存在或待更新的观点');
  const cached = [];
  for (let left = 0; left < uniqueIds.length; left++) {
    for (let right = left + 1; right < uniqueIds.length; right++) {
      const relation = researchStore.getRelation(uniqueIds[left], uniqueIds[right]);
      if (relation) cached.push(relation);
    }
  }
  const coveredIds = new Set(cached.flatMap((relation) => [relation.claim_a_id, relation.claim_b_id]));
  if (cached.length > 0 && uniqueIds.every((id) => coveredIds.has(id))) {
    const explanations = (types) => cached.filter((relation) => types.includes(relation.relation_type)).map((relation) => relation.explanation);
    return {
      relations: cached,
      synthesis: {
        consensus: explanations(['support', 'complement', 'similar_example']),
        disagreements: explanations(['oppose']),
        different_conditions: explanations(['different_scope']),
        practical_suggestions: explanations(['complement']),
        open_questions: [],
      },
      cached: true,
    };
  }
  const payload = claims.map((claim) => ({ id: claim.id, question: claim.question, claim: claim.claim, reasoning: claim.reasoning, evidence: claim.evidence_excerpt }));
  const result = parseJson(await generateText({
    prompt: `只依据以下观点及证据判断关系，不得补充外部事实。只比较有研究价值的候选对，不要求全量两两比较。关系类型只能是 support、oppose、complement、different_scope、similar_example、unrelated。输出 JSON：{"relations":[{"claim_a_id":1,"claim_b_id":2,"relation_type":"support","explanation":"证据内解释","confidence":0.8}],"consensus":["主要共识"],"disagreements":["主要分歧"],"different_conditions":["条件不同"],"practical_suggestions":["值得实践的建议"],"open_questions":["尚未回答的问题"]}\n<claims>\n${JSON.stringify(payload)}\n</claims>`,
    systemPrompt: '你是观点关系审稿人，只能使用提供的观点和逐字稿证据。',
    maxTokens: 5000,
    thinkingEnabled: false,
  }));
  if (!Array.isArray(result.relations) || result.relations.length > 45) throw new Error('观点关系列表无效');
  const allowedIds = new Set(uniqueIds);
  const relations = result.relations.map((relation) => {
    const a = Number(relation.claim_a_id); const b = Number(relation.claim_b_id);
    const confidence = Number(relation.confidence);
    if (!allowedIds.has(a) || !allowedIds.has(b) || a === b) throw new Error('观点关系引用了未选择的观点');
    if (!RELATION_TYPES.has(relation.relation_type)) throw new Error('观点关系类型无效');
    if (typeof relation.explanation !== 'string' || !relation.explanation.trim() || relation.explanation.length > 2000) throw new Error('观点关系解释无效');
    if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) throw new Error('观点关系置信度无效');
    return researchStore.upsertRelation({ claimAId: a, claimBId: b, relationType: relation.relation_type, explanation: relation.explanation.trim(), confidence, analysisModel: model });
  });
  const list = (key) => Array.isArray(result[key]) ? result[key].filter((value) => typeof value === 'string').slice(0, 20) : [];
  return { relations, synthesis: { consensus: list('consensus'), disagreements: list('disagreements'), different_conditions: list('different_conditions'), practical_suggestions: list('practical_suggestions'), open_questions: list('open_questions') } };
}

module.exports = { RELATION_TYPES, analyzeRelations, cosineSimilarity, keywordScore, searchClaims };
