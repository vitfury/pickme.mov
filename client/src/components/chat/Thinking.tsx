import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const WORD_MS = 2600;

/**
 * Порошинки в промені. Кожна прибита до своєї позиції по довжині конуса
 * (`dx`, у відсотках — тому спред не залежить від ширини панелі) і лише
 * локально дрейфує вниз-праворуч, проявляючись і згасаючи. `dy0` вписано у
 * висоту конуса в цій точці: біля лінзи він вузький, біля екрана широкий.
 * Кожна третя (`ds`) помітно більша — ніби пролітає ближче до лінзи.
 */
const DUST = [
  { dx: '3.7%', dy0: '-3.5px', dd: '1.5s', dl: '-0.87s', ds: '2.4px' },
  { dx: '10.3%', dy0: '-1.6px', dd: '1.37s', dl: '-0.9s', ds: '1.4px' },
  { dx: '11.2%', dy0: '-5.1px', dd: '1.43s', dl: '-0.13s', ds: '1.8px' },
  { dx: '16.2%', dy0: '-7.3px', dd: '0.97s', dl: '-1.8s', ds: '2.9px' },
  { dx: '22.9%', dy0: '-2.0px', dd: '0.97s', dl: '-0.6s', ds: '1.5px' },
  { dx: '23.9%', dy0: '4.2px', dd: '1.27s', dl: '-0.27s', ds: '1.8px' },
  { dx: '28.1%', dy0: '5.1px', dd: '1.33s', dl: '-1.0s', ds: '2.5px' },
  { dx: '33.6%', dy0: '-12.0px', dd: '0.97s', dl: '-1.57s', ds: '1.4px' },
  { dx: '38.9%', dy0: '-12.6px', dd: '1.77s', dl: '-1.6s', ds: '1.7px' },
  { dx: '42.9%', dy0: '-1.4px', dd: '1.57s', dl: '-0.23s', ds: '2.7px' },
  { dx: '47.3%', dy0: '-14.7px', dd: '1.73s', dl: '-1.6s', ds: '1.5px' },
  { dx: '49.5%', dy0: '-5.8px', dd: '1.27s', dl: '-1.8s', ds: '1.5px' },
  { dx: '52.2%', dy0: '-20.1px', dd: '1.57s', dl: '-1.8s', ds: '2.7px' },
  { dx: '58.2%', dy0: '-1.8px', dd: '1.57s', dl: '-0.4s', ds: '1.6px' },
  { dx: '62.5%', dy0: '1.8px', dd: '1.1s', dl: '-0.3s', ds: '1.4px' },
  { dx: '68.2%', dy0: '-12.0px', dd: '1.47s', dl: '-0.57s', ds: '2.3px' },
  { dx: '68.7%', dy0: '12.4px', dd: '1.6s', dl: '-0.67s', ds: '1.7px' },
  { dx: '75.3%', dy0: '18.8px', dd: '1.77s', dl: '-0.73s', ds: '1.9px' },
  { dx: '80.6%', dy0: '1.5px', dd: '1.7s', dl: '-0.9s', ds: '2.6px' },
  { dx: '81.7%', dy0: '19.4px', dd: '1.07s', dl: '-0.13s', ds: '1.8px' },
  { dx: '88.0%', dy0: '-5.1px', dd: '1.67s', dl: '-0.1s', ds: '1.4px' },
  { dx: '90.1%', dy0: '-9.5px', dd: '1.07s', dl: '-0.13s', ds: '2.5px' },
];

/**
 * Що показує панель, поки модель працює.
 *
 * Qwen думає 10-15 секунд до першого видимого токена і вимкнути це неможливо,
 * тож без чогось живого на екрані панель читається як зависла.
 */
export default function Thinking({ leaving = false }: { leaving?: boolean }) {
  const { t } = useTranslation();
  const coneRef = useRef<HTMLDivElement>(null);

  // Перемішуємо при кожному монтуванні, щоб за сесію порядок не повторювався
  // і слова лишались жартом, а не прогрес-баром.
  const words = useMemo(() => {
    const list = t('chat.thinkingWords', { returnObjects: true });
    const arr = Array.isArray(list) ? (list as string[]) : ['…'];
    return [...arr].sort(() => Math.random() - 0.5);
  }, [t]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setIndex((n) => (n + 1) % words.length), WORD_MS);
    return () => clearInterval(timer);
  }, [words.length]);

  // Промінь ледь веде за курсором — дрібниця, але панель перестає бути картинкою
  const tilt = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const y = (e.clientY - box.top) / box.height - 0.5;
    if (coneRef.current) coneRef.current.style.transform = `rotate(${(y * 9).toFixed(2)}deg)`;
  };

  const reset = () => {
    if (coneRef.current) coneRef.current.style.transform = '';
  };

  return (
    <div
      className={`pj-loader${leaving ? ' is-leaving' : ''}`}
      onPointerMove={tilt}
      onPointerLeave={reset}
      aria-live="polite"
    >
      <div className="pj-body">
        <span className="pj-reel pj-reel--a" />
        <span className="pj-reel pj-reel--b" />
      </div>
      {/* Промінь, пил і слово вмикаються/гаснуть разом — окремою обгорткою,
          щоб не воювати з їхніми власними анімаціями прозорості */}
      <div className="pj-beamwrap">
      <div className="pj-cone" ref={coneRef}>
        {DUST.map((d, i) => (
          <i
            key={i}
            style={{
              '--dx': d.dx,
              '--dy0': d.dy0,
              '--dd': d.dd,
              '--dl': d.dl,
              '--ds': d.ds,
            } as React.CSSProperties}
          />
        ))}
      </div>
      </div>
      <div className="pj-screenwrap">
        <div className="pj-screen">
          <span className="pj-word">{words[index]}</span>
        </div>
      </div>
    </div>
  );
}
