import { describe, expect, test } from 'vitest';
import type { ClaimRelationAnalysis, ContentProject } from '../../store';
import {
  appendRelationToDraft,
  buildRelationDraftAppend,
  getCompletionChecks,
  parseUsageNote,
  projectToDraft,
  serializeUsageNote,
} from './contentProjectDraft';

const project: ContentProject = {
  id: 1,
  title: '测试项目',
  topic: '研究问题',
  audience: '',
  goal: '',
  angle: '',
  tone: '',
  content_format: '',
  target_platform: 'wechat',
  thesis: '用户原有共识',
  personal_practice: '',
  personal_judgment: '用户原有判断',
  discussion_question: '',
  status: 'draft',
  claims: [],
  created_at: '2026-07-17',
  updated_at: '2026-07-17',
};

const analysis: ClaimRelationAnalysis = {
  relations: [],
  synthesis: {
    consensus: ['共识 A'],
    disagreements: ['分歧 B'],
    different_conditions: ['条件 C'],
    practical_suggestions: ['实践 D'],
    open_questions: ['问题 E'],
  },
};

describe('内容项目草稿 helper', () => {
  test('关系分析只追加到已有内容并保持原文', () => {
    const draft = projectToDraft(project);
    const result = appendRelationToDraft(draft, buildRelationDraftAppend(analysis));

    expect(result.thesis).toContain('用户原有共识');
    expect(result.thesis).toContain('关系分析 · 主要共识');
    expect(result.personalJudgment).toContain('用户原有判断');
    expect(result.personalJudgment).toContain('分歧 B');
    expect(result.personalJudgment).toContain('条件 C');
    expect(result.discussionQuestion).toContain('问题 E');
    expect(appendRelationToDraft(result, buildRelationDraftAppend(analysis))).toEqual(result);
  });

  test('用途标签与自由备注可以往返转换', () => {
    const value = serializeUsageNote('反方观点', '需要核对样本');
    expect(value).toBe('【反方观点】 需要核对样本');
    expect(parseUsageNote(value)).toEqual({ tag: '反方观点', note: '需要核对样本' });
    expect(parseUsageNote('旧版自由备注')).toEqual({ tag: null, note: '旧版自由备注' });
  });

  test('导出检查允许把缺失项作为提示返回', () => {
    const checks = getCompletionChecks(project, projectToDraft(project));
    expect(checks.map((item) => item.label)).toEqual([
      '尚未选择观点',
      '尚未补充完整播客来源',
      '已填写个人判断',
      '尚未填写个人实践',
      '尚未填写讨论问题',
    ]);
  });
});
