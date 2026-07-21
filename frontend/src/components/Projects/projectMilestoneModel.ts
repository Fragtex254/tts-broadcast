import type { ContentProjectMilestone } from '../../store';

export interface MilestoneEventContext {
  activeProjectId: number | null;
  eventProjectId: number;
  activeTaskId: string | null;
  eventTaskId: string | null;
  consumedIds: string[];
  milestone: ContentProjectMilestone | null;
}

export function acceptMilestoneEvent(context: MilestoneEventContext): ContentProjectMilestone | null {
  const { activeProjectId, eventProjectId, activeTaskId, eventTaskId, consumedIds, milestone } = context;
  if (!milestone || activeProjectId !== eventProjectId || activeTaskId !== eventTaskId) return null;
  if (consumedIds.includes(milestone.id)) return null;
  return milestone;
}
