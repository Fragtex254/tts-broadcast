import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  createTranscriptVirtualLayout,
  getVisibleTranscriptVirtualItems,
} from './transcriptVirtualListModel';

const ESTIMATED_TURN_HEIGHT = 174;
const TURN_GAP = 10;
const OVERSCAN_PX = 520;
const DEFAULT_VIEWPORT_HEIGHT = 720;

interface UseVirtualTranscriptTurnsOptions {
  isEnabled: boolean;
  turnIds: number[];
  pinnedTurnId: number | null;
}

export function useVirtualTranscriptTurns({ isEnabled, turnIds, pinnedTurnId }: UseVirtualTranscriptTurnsOptions) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const scrollTopRef = useRef(0);
  const layoutRef = useRef(createTranscriptVirtualLayout([], new Map(), ESTIMATED_TURN_HEIGHT, TURN_GAP));
  const measuredHeightsRef = useRef<ReadonlyMap<number, number>>(new Map());
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_VIEWPORT_HEIGHT);
  const [measuredHeights, setMeasuredHeights] = useState<ReadonlyMap<number, number>>(new Map());

  const layout = useMemo(
    () => createTranscriptVirtualLayout(turnIds, measuredHeights, ESTIMATED_TURN_HEIGHT, TURN_GAP),
    [measuredHeights, turnIds],
  );
  const virtualItems = useMemo(
    () => getVisibleTranscriptVirtualItems(layout, scrollTop, viewportHeight, OVERSCAN_PX, pinnedTurnId),
    [layout, pinnedTurnId, scrollTop, viewportHeight],
  );
  const viewportItems = useMemo(
    () => getVisibleTranscriptVirtualItems(layout, scrollTop, viewportHeight, 0, null),
    [layout, scrollTop, viewportHeight],
  );
  const visibleEndIndex = viewportItems.length > 0 ? viewportItems[viewportItems.length - 1].index : 0;
  const progressPercent = layout.items.length === 0
    ? 0
    : Math.min(100, Math.round(((visibleEndIndex + 1) / layout.items.length) * 100));

  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useLayoutEffect(() => {
    if (!isEnabled) return undefined;
    const container = scrollContainerRef.current;
    if (!container) return undefined;

    const updateViewport = () => setViewportHeight(container.clientHeight || DEFAULT_VIEWPORT_HEIGHT);
    const handleScroll = () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        scrollTopRef.current = container.scrollTop;
        setScrollTop(container.scrollTop);
      });
    };

    updateViewport();
    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateViewport);
    observer?.observe(container);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      observer?.disconnect();
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [isEnabled]);

  const measureTurn = useCallback((turnId: number, height: number) => {
    const roundedHeight = Math.ceil(height);
    if (roundedHeight <= 0) return;
    const current = measuredHeightsRef.current;
    if (current.get(turnId) === roundedHeight) return;
    const previousHeight = current.get(turnId) || ESTIMATED_TURN_HEIGHT;
    const measuredItem = layoutRef.current.items.find((item) => item.key === turnId);
    const container = scrollContainerRef.current;
    if (container && measuredItem && measuredItem.start + previousHeight <= scrollTopRef.current) {
      const anchoredScrollTop = Math.max(0, scrollTopRef.current + roundedHeight - previousHeight);
      container.scrollTop = anchoredScrollTop;
      scrollTopRef.current = anchoredScrollTop;
      setScrollTop(anchoredScrollTop);
    }
    const next = new Map(current);
    next.set(turnId, roundedHeight);
    measuredHeightsRef.current = next;
    setMeasuredHeights(next);
  }, []);

  const scrollToIndex = useCallback((index: number) => {
    const container = scrollContainerRef.current;
    const target = layout.items[index];
    if (!container || !target) return;
    const nextScrollTop = Math.max(0, target.start - Math.max(0, (container.clientHeight - target.size) / 2));
    container.scrollTop = nextScrollTop;
    scrollTopRef.current = nextScrollTop;
    setScrollTop(nextScrollTop);
  }, [layout.items]);

  return {
    layout,
    measureTurn,
    scrollContainerRef,
    scrollToIndex,
    virtualItems,
    visibleEndIndex,
    progressPercent,
  };
}
