import { useEffect, useState } from 'react';

export interface ViewportBox {
  height: number;
  offsetTop: number;
}

/**
 * Track the part of the screen that is actually visible — the bit the on-screen
 * keyboard has not covered.
 *
 * A `position: fixed` element is laid out against the *layout* viewport, and on
 * iOS that does not shrink when the keyboard slides up: the panel keeps its full
 * height and the keyboard simply covers the bottom of it, input and all.
 * `visualViewport` is the only thing that reports the real visible box.
 *
 * Android is handled declaratively by `interactive-widget=resizes-content` in
 * the viewport meta, but this hook is harmless there and keeps one code path.
 *
 * `offsetTop` matters on iOS specifically: when a focused field is near the
 * bottom, Safari scrolls the visual viewport inside the layout viewport instead
 * of resizing it, and without compensating the panel drifts off screen.
 */
export function useVisualViewport(active: boolean): ViewportBox | null {
  const [box, setBox] = useState<ViewportBox | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) {
      setBox(null);
      return;
    }

    // Округлення принципове: visualViewport на iOS віддає дробові значення
    // (типу 553.5), а дробовий translateY на обгортці змушує Safari
    // растеризувати всю панель між фізичними пікселями — все всередині
    // виглядає розмитим.
    const read = () => setBox({ height: Math.round(vv.height), offsetTop: Math.round(vv.offsetTop) });
    read();

    vv.addEventListener('resize', read);
    vv.addEventListener('scroll', read);
    return () => {
      vv.removeEventListener('resize', read);
      vv.removeEventListener('scroll', read);
    };
  }, [active]);

  return box;
}
