/**
 * Virtual List Component
 * Optimized for rendering large lists with minimal DOM nodes
 * Handles 1000+ items with smooth scrolling on low-end devices
 */

import { useRef, useState, useEffect, useCallback } from 'react';
import styles from './VirtualList.module.scss';

interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  bufferSize?: number;
  keyExtractor: (item: T, index: number) => string;
  onEndReached?: () => void;
  onEndReachedThreshold?: number;
}

export function VirtualList<T>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  bufferSize = 5,
  keyExtractor,
  onEndReached,
  onEndReachedThreshold = 0.8,
}: VirtualListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const totalHeight = items.length * itemHeight;
  const visibleCount = Math.ceil(containerHeight / itemHeight);

  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
  const endIndex = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + bufferSize
  );

  const visibleItems = items.slice(startIndex, endIndex + 1);
  const offsetY = startIndex * itemHeight;

  // Debounced scroll handler
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;

    const newScrollTop = containerRef.current.scrollTop;
    setScrollTop(newScrollTop);

    // Check if near end
    if (onEndReached) {
      const scrollHeight = containerRef.current.scrollHeight;
      const clientHeight = containerRef.current.clientHeight;
      const scrollRatio = (newScrollTop + clientHeight) / scrollHeight;

      if (scrollRatio >= onEndReachedThreshold) {
        onEndReached();
      }
    }
  }, [onEndReached, onEndReachedThreshold]);

  // Use requestAnimationFrame for smooth scrolling
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number;
    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(handleScroll);
    };

    container.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [handleScroll]);

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{ height: containerHeight, overflow: 'auto' }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0,
          }}
        >
          {visibleItems.map((item, relativeIndex) => {
            const absoluteIndex = startIndex + relativeIndex;
            return (
              <div
                key={keyExtractor(item, absoluteIndex)}
                style={{ height: itemHeight }}
              >
                {renderItem(item, absoluteIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Grid variant for product catalogs
interface VirtualGridProps<T> {
  items: T[];
  itemWidth: number;
  itemHeight: number;
  containerWidth: number;
  containerHeight: number;
  gap?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  keyExtractor: (item: T, index: number) => string;
}

export function VirtualGrid<T>({
  items,
  itemWidth,
  itemHeight,
  containerWidth,
  containerHeight,
  gap = 16,
  renderItem,
  keyExtractor,
}: VirtualGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);

  const columns = Math.floor((containerWidth + gap) / (itemWidth + gap));
  const rows = Math.ceil(items.length / columns);
  const totalHeight = rows * (itemHeight + gap);

  const visibleRowCount = Math.ceil(containerHeight / (itemHeight + gap));
  const bufferRows = 2;

  const startRow = Math.max(0, Math.floor(scrollTop / (itemHeight + gap)) - bufferRows);
  const endRow = Math.min(rows - 1, startRow + visibleRowCount + bufferRows * 2);

  const startIndex = startRow * columns;
  const endIndex = Math.min(items.length - 1, (endRow + 1) * columns - 1);

  const visibleItems = items.slice(startIndex, endIndex + 1);
  const offsetY = startRow * (itemHeight + gap);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    setScrollTop(containerRef.current.scrollTop);
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let rafId: number;
    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(handleScroll);
    };

    container.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      container.removeEventListener('scroll', onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [handleScroll]);

  return (
    <div
      ref={containerRef}
      className={styles.gridContainer}
      style={{ height: containerHeight, overflow: 'auto', overflowX: 'hidden' }}
    >
      <div style={{ height: totalHeight, position: 'relative', width: '100%' }}>
        <div
          style={{
            position: 'absolute',
            top: offsetY,
            left: 0,
            right: 0,
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${itemWidth}px, 1fr))`,
            gap: `${gap}px`,
            width: '100%',
          }}
        >
          {visibleItems.map((item, relativeIndex) => {
            const absoluteIndex = startIndex + relativeIndex;
            return (
              <div key={keyExtractor(item, absoluteIndex)}>
                {renderItem(item, absoluteIndex)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
