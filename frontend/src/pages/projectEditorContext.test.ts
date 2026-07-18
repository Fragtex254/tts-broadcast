import { describe, expect, test } from 'vitest';
import type { ProjectEditorContext } from '../store';
import { getProjectEditorUrl, parseProjectEditorContext } from './projectEditorContext';

describe('parseProjectEditorContext', () => {
  test('没有项目参数时保持旧编辑器模式', () => {
    expect(parseProjectEditorContext(new URLSearchParams())).toEqual({ kind: 'legacy' });
  });

  test('完整正整数参数形成项目口播上下文', () => {
    expect(parseProjectEditorContext(new URLSearchParams('projectId=2&artifactId=8&revisionId=21'))).toEqual({
      kind: 'project',
      projectId: 2,
      artifactId: 8,
      revisionId: 21,
    });
  });

  test('参数缺失或非法时不降级成旧内存稿', () => {
    expect(parseProjectEditorContext(new URLSearchParams('projectId=2&artifactId=8'))).toEqual({ kind: 'invalid' });
    expect(parseProjectEditorContext(new URLSearchParams('projectId=2&artifactId=oops&revisionId=21'))).toEqual({ kind: 'invalid' });
  });

  test('确切项目 Revision 生成包含全部 provenance 的编辑器地址', () => {
    const context: ProjectEditorContext = {
      projectId: 2,
      artifactId: 8,
      revision: {
        id: 21,
        artifact_id: 8,
        revision_number: 2,
        content: '项目口播正文',
        change_reason: '同步自主稿',
        created_at: '2026-07-18T00:00:00.000Z',
      },
    };

    expect(getProjectEditorUrl(context)).toBe('/editor?projectId=2&artifactId=8&revisionId=21');
  });
});
