import { useEffect, useRef, useCallback } from 'react';

const SHAKE_THRESHOLD = 25;
const SHAKE_COOLDOWN = 1000;

export function useShakeDetector(onShake: () => void) {
  const lastShakeRef = useRef(0);
  const lastAccelRef = useRef({ x: 0, y: 0, z: 0 });

  const handleMotion = useCallback(
    (e: DeviceMotionEvent) => {
      const accel = e.accelerationIncludingGravity;
      if (!accel?.x || !accel?.y || !accel?.z) return;

      const diff =
        Math.abs(accel.x - lastAccelRef.current.x) +
        Math.abs(accel.y - lastAccelRef.current.y) +
        Math.abs(accel.z - lastAccelRef.current.z);

      lastAccelRef.current = { x: accel.x, y: accel.y, z: accel.z };

      const now = Date.now();
      if (diff > SHAKE_THRESHOLD && now - lastShakeRef.current > SHAKE_COOLDOWN) {
        lastShakeRef.current = now;
        onShake();
      }
    },
    [onShake],
  );

  useEffect(() => {
    const requestPermission = async () => {
      if (
        typeof DeviceMotionEvent !== 'undefined' &&
        'requestPermission' in DeviceMotionEvent &&
        typeof (DeviceMotionEvent as { requestPermission?: () => Promise<string> }).requestPermission === 'function'
      ) {
        try {
          const permission = await (DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }).requestPermission();
          if (permission !== 'granted') return;
        } catch {
          return;
        }
      }
      window.addEventListener('devicemotion', handleMotion);
    };

    requestPermission();

    return () => {
      window.removeEventListener('devicemotion', handleMotion);
    };
  }, [handleMotion]);
}
