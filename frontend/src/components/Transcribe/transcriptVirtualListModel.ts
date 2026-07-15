export interface TranscriptVirtualItem {
  index: number;
  key: number;
  start: number;
  size: number;
}

export interface TranscriptVirtualLayout {
  items: TranscriptVirtualItem[];
  totalSize: number;
}

export function createTranscriptVirtualLayout(
  keys: number[],
  measuredHeights: ReadonlyMap<number, number>,
  estimatedHeight: number,
  gap: number,
): TranscriptVirtualLayout {
  let offset = 0;
  const items = keys.map((key, index) => {
    const size = measuredHeights.get(key) || estimatedHeight;
    const item = { index, key, start: offset, size };
    offset += size + gap;
    return item;
  });

  return { items, totalSize: Math.max(0, offset - gap) };
}

export function getVisibleTranscriptVirtualItems(
  layout: TranscriptVirtualLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan: number,
  pinnedKey: number | null,
): TranscriptVirtualItem[] {
  const visibleStart = Math.max(0, scrollTop - overscan);
  const visibleEnd = scrollTop + viewportHeight + overscan;
  let low = 0;
  let high = layout.items.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const item = layout.items[middle];
    if (item.start + item.size < visibleStart) low = middle + 1;
    else high = middle;
  }

  const visibleItems: TranscriptVirtualItem[] = [];
  for (let index = low; index < layout.items.length; index += 1) {
    const item = layout.items[index];
    if (item.start > visibleEnd) break;
    visibleItems.push(item);
  }

  if (pinnedKey === null || visibleItems.some((item) => item.key === pinnedKey)) return visibleItems;
  const pinnedItem = layout.items.find((item) => item.key === pinnedKey);
  if (!pinnedItem) return visibleItems;
  return [...visibleItems, pinnedItem].sort((left, right) => left.index - right.index);
}
