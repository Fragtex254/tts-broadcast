import type { ClaimRelationAnalysis, ContentProject, ContentTargetPlatform } from '../../store';

export interface ContentProjectDraft {
  topic: string;
  thesis: string;
  personalPractice: string;
  personalJudgment: string;
  discussionQuestion: string;
}

export interface RelationDraftAppend {
  thesis: string;
  personalJudgment: string;
  discussionQuestion: string;
}

export interface CompletionCheck {
  key: 'claims' | 'sources' | 'judgment' | 'practice' | 'discussion';
  label: string;
  isComplete: boolean;
}

export const CLAIM_USAGE_TAGS = ['核心论据', '反方观点', '案例', '背景资料', '金句', '待验证'] as const;
export type ClaimUsageTag = typeof CLAIM_USAGE_TAGS[number];

export const PLATFORM_FIELD_COPY: Record<ContentTargetPlatform, {
  focus: string[];
  fields: Array<{ key: Exclude<keyof ContentProjectDraft, 'topic'>; label: string; placeholder: string; rows: number }>;
}> = {
  xiaohongshu: {
    focus: ['最值得讨论的一句话', '我认同或质疑的地方', '对普通人的影响', '评论区讨论问题'],
    fields: [
      { key: 'thesis', label: '最值得讨论的一句话', placeholder: '用一句能引发讨论的话，提炼这次研究的核心…', rows: 2 },
      { key: 'personalJudgment', label: '我认同或质疑的地方', placeholder: '哪些地方你认同，哪些地方仍然质疑？', rows: 4 },
      { key: 'personalPractice', label: '对普通人的影响', placeholder: '这件事会怎样影响普通人的选择和行动？', rows: 3 },
      { key: 'discussionQuestion', label: '评论区讨论问题', placeholder: '给读者一个具体、容易回答的问题…', rows: 2 },
    ],
  },
  wechat: {
    focus: ['多期播客的共识', '主要分歧', '分歧成立的条件', '个人实践', '阶段性判断'],
    fields: [
      { key: 'thesis', label: '多期播客的共识', placeholder: '多期内容反复指向了哪些共同判断？', rows: 3 },
      { key: 'personalJudgment', label: '主要分歧、成立条件与阶段性判断', placeholder: '主要分歧：\n成立条件：\n阶段性判断：', rows: 6 },
      { key: 'personalPractice', label: '个人实践', placeholder: '你已经做过或准备验证哪些具体实践？', rows: 3 },
      { key: 'discussionQuestion', label: '值得继续追问的问题', placeholder: '还有哪些问题需要继续研究？', rows: 2 },
    ],
  },
  twitter: {
    focus: ['核心主张', '个人判断', '个人实践', '讨论问题'],
    fields: [
      { key: 'thesis', label: '核心主张', placeholder: '提炼核心主张…', rows: 2 },
      { key: 'personalJudgment', label: '我的判断', placeholder: '写下你目前的判断…', rows: 4 },
      { key: 'personalPractice', label: '个人实践', placeholder: '补充具体实践…', rows: 2 },
      { key: 'discussionQuestion', label: '讨论问题', placeholder: '留下一个问题…', rows: 2 },
    ],
  },
  general: {
    focus: ['核心主张', '个人判断', '个人实践', '讨论问题'],
    fields: [
      { key: 'personalJudgment', label: '我的判断', placeholder: '结合这些观点和证据，写下你目前的判断…', rows: 5 },
      { key: 'thesis', label: '核心主张', placeholder: '提炼项目的核心主张…', rows: 2 },
      { key: 'personalPractice', label: '个人实践', placeholder: '补充亲自做过或准备验证的实践…', rows: 2 },
      { key: 'discussionQuestion', label: '留给读者的问题', placeholder: '留下一个值得讨论的问题…', rows: 2 },
    ],
  },
};

export function projectToDraft(project: ContentProject): ContentProjectDraft {
  return {
    topic: project.topic,
    thesis: project.thesis,
    personalPractice: project.personal_practice,
    personalJudgment: project.personal_judgment,
    discussionQuestion: project.discussion_question,
  };
}

function formatSection(title: string, items: string[]): string {
  if (items.length === 0) return '';
  return `${title}\n${items.map((item) => `- ${item}`).join('\n')}`;
}

export function buildRelationDraftAppend(analysis: ClaimRelationAnalysis): RelationDraftAppend {
  return {
    thesis: formatSection('关系分析 · 主要共识', analysis.synthesis.consensus),
    personalJudgment: [
      formatSection('关系分析 · 主要分歧', analysis.synthesis.disagreements),
      formatSection('关系分析 · 条件差异', analysis.synthesis.different_conditions),
    ].filter(Boolean).join('\n\n'),
    discussionQuestion: formatSection('关系分析 · 值得继续追问', analysis.synthesis.open_questions),
  };
}

function appendText(current: string, addition: string): string {
  if (!addition || current.includes(addition)) return current;
  return current.trim() ? `${current.trim()}\n\n${addition}` : addition;
}

export function appendRelationToDraft(draft: ContentProjectDraft, addition: RelationDraftAppend): ContentProjectDraft {
  return {
    ...draft,
    thesis: appendText(draft.thesis, addition.thesis),
    personalJudgment: appendText(draft.personalJudgment, addition.personalJudgment),
    discussionQuestion: appendText(draft.discussionQuestion, addition.discussionQuestion),
  };
}

export function parseUsageNote(value: string): { tag: ClaimUsageTag | null; note: string } {
  const match = value.match(/^【([^】]+)】\s*([\s\S]*)$/);
  const tag = CLAIM_USAGE_TAGS.find((item) => item === match?.[1]) || null;
  return tag ? { tag, note: match?.[2] || '' } : { tag: null, note: value };
}

export function serializeUsageNote(tag: ClaimUsageTag | null, note: string): string {
  const trimmedNote = note.trim();
  if (!tag) return trimmedNote;
  return trimmedNote ? `【${tag}】 ${trimmedNote}` : `【${tag}】`;
}

export function getCompletionChecks(project: ContentProject, draft: ContentProjectDraft): CompletionCheck[] {
  const hasClaims = project.claims.length > 0;
  const hasSources = hasClaims && project.claims.every((item) => Boolean(item.claim.podcast_name.trim() && item.claim.episode_title.trim()));
  return [
    { key: 'claims', label: hasClaims ? '已选择观点' : '尚未选择观点', isComplete: hasClaims },
    { key: 'sources', label: hasSources ? '已补充播客来源' : '尚未补充完整播客来源', isComplete: hasSources },
    { key: 'judgment', label: draft.personalJudgment.trim() ? '已填写个人判断' : '尚未填写个人判断', isComplete: Boolean(draft.personalJudgment.trim()) },
    { key: 'practice', label: draft.personalPractice.trim() ? '已填写个人实践' : '尚未填写个人实践', isComplete: Boolean(draft.personalPractice.trim()) },
    { key: 'discussion', label: draft.discussionQuestion.trim() ? '已填写讨论问题' : '尚未填写讨论问题', isComplete: Boolean(draft.discussionQuestion.trim()) },
  ];
}
