import { useMotionValue, useTransform } from 'framer-motion';
import { useState } from 'react';

export type SwipeDirection = 'left' | 'right' | 'up' | null;

const SWIPE_THRESHOLD = 150;
const SUPERLIKE_THRESHOLD = -120;

export function useSwipeGesture(onSwipe: (direction: SwipeDirection) => void) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [isDragging, setIsDragging] = useState(false);

  const rotate = useTransform(x, [-300, 0, 300], [-15, 0, 15]);
  const likeOpacity = useTransform(x, [0, SWIPE_THRESHOLD], [0, 1]);
  const dislikeOpacity = useTransform(x, [-SWIPE_THRESHOLD, 0], [1, 0]);
  const superlikeOpacity = useTransform(y, [SUPERLIKE_THRESHOLD, 0], [1, 0]);

  const onDragStart = () => setIsDragging(true);

  const onDragEnd = () => {
    setIsDragging(false);
    const xVal = x.get();
    const yVal = y.get();

    if (yVal < SUPERLIKE_THRESHOLD) {
      onSwipe('up');
    } else if (xVal > SWIPE_THRESHOLD) {
      onSwipe('right');
    } else if (xVal < -SWIPE_THRESHOLD) {
      onSwipe('left');
    } else {
      onSwipe(null);
    }
  };

  return {
    x,
    y,
    rotate,
    isDragging,
    likeOpacity,
    dislikeOpacity,
    superlikeOpacity,
    onDragStart,
    onDragEnd,
  };
}
