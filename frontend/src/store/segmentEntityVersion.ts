const segmentEntityVersions = new Map<number, number>();

export function getSegmentEntityVersion(broadcastId: number): number {
  return segmentEntityVersions.get(broadcastId) ?? 0;
}

export function markSegmentEntityChanged(broadcastId: number): void {
  segmentEntityVersions.set(broadcastId, getSegmentEntityVersion(broadcastId) + 1);
}
