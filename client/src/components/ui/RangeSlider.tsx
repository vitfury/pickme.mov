import { useCallback, useRef, useEffect, useState } from 'react';

interface RangeSliderProps {
  min: number;
  max: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  step?: number;
  label?: string;
  formatValue?: (v: number) => string;
}

export default function RangeSlider({
  min,
  max,
  value,
  onChange,
  step = 1,
  label,
  formatValue = String,
}: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<'low' | 'high' | null>(null);

  const toPercent = useCallback(
    (v: number) => ((v - min) / (max - min)) * 100,
    [min, max],
  );

  const fromPosition = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return min;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const raw = min + pct * (max - min);
      return Math.round(raw / step) * step;
    },
    [min, max, step],
  );

  const handleMove = useCallback(
    (clientX: number) => {
      if (!dragging) return;
      const val = fromPosition(clientX);
      if (dragging === 'low') {
        onChange([Math.min(val, value[1] - step), value[1]]);
      } else {
        onChange([value[0], Math.max(val, value[0] + step)]);
      }
    },
    [dragging, fromPosition, onChange, value, step],
  );

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => handleMove(e.clientX);
    const onUp = () => setDragging(null);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, handleMove]);

  const lowPct = toPercent(value[0]);
  const highPct = toPercent(value[1]);

  return (
    <div className="space-y-2">
      {label && (
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">{label}</span>
          <span className="text-text font-medium">
            {formatValue(value[0])} — {formatValue(value[1])}
          </span>
        </div>
      )}
      <div
        ref={trackRef}
        className="relative h-8 flex items-center cursor-pointer"
        onPointerDown={(e) => {
          const val = fromPosition(e.clientX);
          const distLow = Math.abs(val - value[0]);
          const distHigh = Math.abs(val - value[1]);
          setDragging(distLow <= distHigh ? 'low' : 'high');
        }}
      >
        <div className="absolute left-0 right-0 h-1 bg-surface-light rounded-full" />
        <div
          className="absolute h-1 bg-accent rounded-full"
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
        />
        <div
          className="absolute w-5 h-5 bg-accent rounded-full shadow-lg -translate-x-1/2 touch-none"
          style={{ left: `${lowPct}%` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragging('low');
          }}
        />
        <div
          className="absolute w-5 h-5 bg-accent rounded-full shadow-lg -translate-x-1/2 touch-none"
          style={{ left: `${highPct}%` }}
          onPointerDown={(e) => {
            e.stopPropagation();
            setDragging('high');
          }}
        />
      </div>
    </div>
  );
}
