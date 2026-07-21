import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import useStore, { type ContentProjectWorkspace } from '../../store';
import { ProjectCreationFlow } from './ProjectCreationFlow';

const workspace: ContentProjectWorkspace = {
  project: {
    id: 12,
    title: '错误可恢复测试',
    topic: '',
    audience: '',
    goal: '',
    angle: '',
    tone: '',
    content_format: '',
    target_platform: 'general',
    thesis: '',
    personal_practice: '',
    personal_judgment: '',
    discussion_question: '',
    status: 'draft',
    claims: [],
    created_at: '',
    updated_at: '',
  },
  sources: [],
  evidence: [],
  generation_jobs: [],
  artifacts: [],
};

describe('ProjectCreationFlow', () => {
  beforeEach(() => {
    useStore.setState({
      projectWorkspace: workspace,
      projectSourceFragments: {},
      isLoadingProjectSourceFragments: false,
      projectSourceFragmentsError: null,
      activeProjectTaskId: null,
      activeProjectJobOperation: null,
      projectWorkspaceJobError: null,
      projectWorkspaceSaveError: null,
      projectOutlineRevisions: [],
      isLoadingProjectOutlineRevisions: false,
      projectOutlineRevisionsError: null,
      fetchProjectSourceFragments: vi.fn().mockResolvedValue([]),
      createManualProjectEvidence: vi.fn(),
      updateProjectEvidence: vi.fn(),
      startProjectCreationJob: vi.fn(),
      createProjectWorkspaceArtifact: vi.fn(),
      saveProjectArtifactRevision: vi.fn(),
      fetchProjectOutlineRevisions: vi.fn().mockResolvedValue([]),
    });
  });

  test('异步失败在 activeOperation 清空后仍保持可见和可恢复说明', () => {
    useStore.setState({ projectWorkspaceJobError: '模型暂时不可用' });

    render(<ProjectCreationFlow workspace={workspace} />);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('模型暂时不可用');
    expect(alert.textContent).toContain('已有输入和已保存版本不会丢失');
  });
});
