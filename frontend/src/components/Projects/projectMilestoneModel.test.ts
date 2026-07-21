import { describe, expect, test } from 'vitest';
import type { ContentProjectMilestone } from '../../store';
import { acceptMilestoneEvent } from './projectMilestoneModel';

const milestone: ContentProjectMilestone = {
  id: 'milestone-1',
  kind: 'evidence_selected',
  title: '证据链已建立',
  description: '已确认 3 条可追溯证据。',
};

describe('acceptMilestoneEvent', () => {
  test('只接收当前项目当前操作返回且尚未消费的事件', () => {
    expect(acceptMilestoneEvent({
      activeProjectId: 12,
      eventProjectId: 12,
      activeTaskId: 'task-current',
      eventTaskId: 'task-current',
      consumedIds: [],
      milestone,
    })).toEqual(milestone);

    expect(acceptMilestoneEvent({
      activeProjectId: 12,
      eventProjectId: 13,
      activeTaskId: 'task-current',
      eventTaskId: 'task-current',
      consumedIds: [],
      milestone,
    })).toBeNull();

    expect(acceptMilestoneEvent({
      activeProjectId: 12,
      eventProjectId: 12,
      activeTaskId: 'task-current',
      eventTaskId: 'task-old',
      consumedIds: [],
      milestone,
    })).toBeNull();

    expect(acceptMilestoneEvent({
      activeProjectId: 12,
      eventProjectId: 12,
      activeTaskId: 'task-current',
      eventTaskId: 'task-current',
      consumedIds: ['milestone-1'],
      milestone,
    })).toBeNull();
  });
});
