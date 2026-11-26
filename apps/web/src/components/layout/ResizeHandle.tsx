import React, { useState, useRef, useEffect, useCallback } from 'react';

export type ResizeEdge = 'right' | 'left' | 'top';

export interface ResizeHandleProps {
  edge: ResizeEdge;
  currentSize: number;
  minSize: number;
  maxSize: number;
  onResize: (nextSize: number) => void;
  onReset?: () => void;
  label: string;
  testId?: string;
}

export function clampSize(value: number, min: number, max: number): number {
  const safeMax = Math.max(min, max);
  if (!Number.isFinite(value)) return min;
  return Math.min(safeMax, Math.max(min, Math.round(value)));
}

/**
 * Draggable and keyboard-accessible 6px resize handle attached to a panel edge.
 * Uses window-level pointer listeners plus a full-viewport drag shield overlay
 * so dragging remains smooth across Monaco Editor and sandboxed iframes.
 */
export const ResizeHandle: React.FC<ResizeHandleProps> = ({
  edge,
  currentSize,
  minSize,
  maxSize,
  onResize,
  onReset,
  label,
  testId,
}) => {
  const isHorizontalDrag = edge === 'left' || edge === 'right';
  const cursor = isHorizontalDrag ? 'col-resize' : 'row-resize';

  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const cleanupRef = useRef<(() => void) | null>(null);
  const latestPropsRef = useRef({ currentSize, minSize, maxSize, onResize, edge });
  latestPropsRef.current = { currentSize, minSize, maxSize, onResize, edge };

  const stopDragging = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopDragging();
    };
  }, [stopDragging]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    e.preventDefault();
    e.stopPropagation();

    // Ensure any previous drag session is cleaned up before starting a new one
    stopDragging();

    const startCoord = isHorizontalDrag ? e.clientX : e.clientY;
    if (!Number.isFinite(startCoord)) return;
    const startSize = latestPropsRef.current.currentSize;
    const prevUserSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = cursor;
    setIsDragging(true);

    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // Ignore in environments without pointer capture support (e.g. jsdom)
    }

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const { minSize: min, maxSize: max, onResize: emitResize, edge: activeEdge } =
        latestPropsRef.current;
      const currentCoord =
        activeEdge === 'left' || activeEdge === 'right' ? moveEvent.clientX : moveEvent.clientY;
      if (!Number.isFinite(currentCoord)) return;
      const rawDelta = currentCoord - startCoord;
      const signedDelta = activeEdge === 'right' ? rawDelta : -rawDelta;
      emitResize(clampSize(startSize + signedDelta, min, max));
    };

    const handlePointerEnd = () => {
      stopDragging();
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerEnd);
    window.addEventListener('pointercancel', handlePointerEnd);
    window.addEventListener('blur', handlePointerEnd);

    cleanupRef.current = () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerEnd);
      window.removeEventListener('pointercancel', handlePointerEnd);
      window.removeEventListener('blur', handlePointerEnd);
      document.body.style.userSelect = prevUserSelect;
      document.body.style.cursor = prevCursor;
      setIsDragging(false);
    };
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    let delta = 0;

    if (isHorizontalDrag) {
      if (e.key === 'ArrowRight') delta = edge === 'right' ? step : -step;
      else if (e.key === 'ArrowLeft') delta = edge === 'right' ? -step : step;
    } else {
      if (e.key === 'ArrowUp') delta = step;
      else if (e.key === 'ArrowDown') delta = -step;
    }

    if (delta !== 0) {
      e.preventDefault();
      onResize(clampSize(currentSize + delta, minSize, maxSize));
    } else if (e.key === 'Home') {
      e.preventDefault();
      onResize(minSize);
    } else if (e.key === 'End') {
      e.preventDefault();
      onResize(Math.max(minSize, maxSize));
    }
  };

  const positionStyle: React.CSSProperties =
    edge === 'right'
      ? { top: 0, bottom: 0, right: -3, width: '6px' }
      : edge === 'left'
        ? { top: 0, bottom: 0, left: -3, width: '6px' }
        : { left: 0, right: 0, top: -3, height: '6px' };

  const indicatorStyle: React.CSSProperties = isHorizontalDrag
    ? {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '2px',
        width: '2px',
        backgroundColor: isDragging || isHovered ? 'var(--accent)' : 'transparent',
        transition: isDragging ? 'none' : 'background-color 0.12s ease',
        pointerEvents: 'none',
      }
    : {
        position: 'absolute',
        left: 0,
        right: 0,
        top: '2px',
        height: '2px',
        backgroundColor: isDragging || isHovered ? 'var(--accent)' : 'transparent',
        transition: isDragging ? 'none' : 'background-color 0.12s ease',
        pointerEvents: 'none',
      };

  return (
    <>
      <div
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-orientation={isHorizontalDrag ? 'vertical' : 'horizontal'}
        aria-valuenow={currentSize}
        aria-valuemin={minSize}
        aria-valuemax={Math.max(minSize, maxSize)}
        data-testid={testId}
        data-dragging={isDragging ? 'true' : 'false'}
        onPointerDown={handlePointerDown}
        onKeyDown={handleKeyDown}
        onDoubleClick={() => onReset?.()}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        style={{
          position: 'absolute',
          ...positionStyle,
          cursor,
          zIndex: 30,
          touchAction: 'none',
          userSelect: 'none',
          outline: 'none',
        }}
      >
        <div style={indicatorStyle} />
      </div>
      {isDragging && (
        <div
          data-testid={testId ? `${testId}-overlay` : 'resize-drag-overlay'}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            cursor,
            userSelect: 'none',
            backgroundColor: 'transparent',
          }}
        />
      )}
    </>
  );
};
