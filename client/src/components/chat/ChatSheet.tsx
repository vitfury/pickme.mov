import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useUIStore } from '@/stores/uiStore';
import { useChatStore, type ChatMessage } from '@/stores/chatStore';
import { useVisualViewport } from '@/hooks/useVisualViewport';
import Thinking from './Thinking';
import TitleCard from './TitleCard';

/* Підказки під полем вводу: кожна — готовий запит, який показує, що саме
   асистент вміє. Жанр плюс десятиліття, нагороди, хронометраж і суб'єктивний
   підбір — чотири штуки, щоб на телефоні лягали у два ряди. Тексти в i18n. */
const SUGGESTIONS = ['comedy00', 'western', 'short', 'kid'] as const;

export default function ChatSheet() {
  const { t } = useTranslation();
  const open = useUIStore((s) => s.chatOpen);
  const setOpen = useUIStore((s) => s.setChatOpen);

  const messages = useChatStore((s) => s.messages);
  const streaming = useChatStore((s) => s.streaming);
  const send = useChatStore((s) => s.send);
  const stop = useChatStore((s) => s.stop);
  const clear = useChatStore((s) => s.clear);

  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Видимий прямокутник зменшується, коли виїжджає екранна клавіатура;
  // панель розмірюється по ньому, тож поле вводу ніколи не опиняється під нею.
  const viewport = useVisualViewport(open);

  // Завжди в самий низ: нове повідомлення, поява проєктора, відповідь —
  // будь-яка зміна списку тягне скрол донизу.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Фокусуємо якомога раніше, а не після анімації відкриття: мобільні браузери
  // піднімають клавіатуру лише для фокуса, який ще належить тому тапу.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [viewport?.height]);

  const submit = (text?: string) => {
    const value = text ?? draft;
    if (!text) setDraft('');
    void send(value);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] bg-overlay"
          />
          <div
            className="chat-inset fixed inset-x-0 top-0 z-[65] flex pointer-events-none"
            style={
              viewport
                ? { height: viewport.height, transform: `translateY(${viewport.offsetTop}px)` }
                : { height: '100%' }
            }
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.98 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="chat-panel pointer-events-auto flex flex-col w-full h-full overflow-hidden"
            >
              <header className="chat-head">
                <span className="chat-head__title">
                  {t('chat.title')}
                  <small>{t('chat.subtitle')}</small>
                </span>
                <span className="chat-head__actions">
                <button
                  onClick={() => {
                    clear();
                    inputRef.current?.focus();
                  }}
                  aria-label={t('chat.newChat')}
                  title={t('chat.newChat')}
                  className="chat-x"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.375 2.625a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4Z" />
                  </svg>
                </button>
                <button
                  onClick={() => setOpen(false)}
                  aria-label={t('common.close')}
                  className="chat-x"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
                </span>
              </header>

              <div ref={scrollRef} className="chat-msgs">
                {messages.length === 0 && <EmptyState />}
                {messages.map((message, i) => (
                  <Bubble key={message.id} message={message} isLast={i === messages.length - 1} />
                ))}
              </div>

              <footer className="chat-foot">
                {messages.length === 0 && (
                  <div className="chat-sugg">
                    {SUGGESTIONS.map((key) => (
                      <button key={key} type="button" onClick={() => submit(t(`chat.suggestions.${key}`))}>
                        {t(`chat.suggestions.${key}`)}
                      </button>
                    ))}
                  </div>
                )}
                <div className="chat-inrow">
                  <div className="chat-pill">
                    <textarea
                      ref={inputRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          submit();
                        }
                      }}
                      rows={1}
                      placeholder={t('chat.placeholder')}
                    />
                  </div>
                  <button
                    onClick={() => (streaming ? stop() : submit())}
                    disabled={!streaming && !draft.trim()}
                    aria-label={streaming ? t('chat.stop') : t('chat.send')}
                    className="chat-send"
                  >
                    {streaming ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
                    ) : (
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                      </svg>
                    )}
                  </button>
                </div>
              </footer>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Порожній стан: не «запитай що завгодно», а перелік того, що асистент реально
 * вміє. Пошук очевидний, а от що він може писати в профіль — ні, і без підказки
 * цим просто не користуються.
 */
function EmptyState() {
  const { t } = useTranslation();
  const raw = t('chat.emptyCan', { returnObjects: true });
  const can = Array.isArray(raw) ? (raw as string[]) : [];

  return (
    <div className="chat-empty">
      <p className="chat-empty__lead">{t('chat.emptyLead')}</p>
      <ul className="chat-empty__list">
        {can.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/** `[[123]]` — мітка тайтла від моделі; текст лишається без неї, id іде в картку */
const TITLE_REF = /\[\[(\d+)\]\]/g;

function splitTitleRefs(content: string): { text: string; ids: number[] } {
  const ids: number[] = [];
  const text = content.replace(TITLE_REF, (_, id) => {
    const n = Number(id);
    if (!ids.includes(n)) ids.push(n);
    return '';
  });
  // Модель зазвичай ставить мітку після назви, тож лишаються подвійні пробіли
  return { text: text.replace(/[ \t]{2,}/g, ' ').trim(), ids };
}

/**
 * Модель вперто виділяє назви `**жирним**`, хоч промпт цього й не просить.
 * Повноцінний markdown тут зайвий — рендеримо єдине, що вона реально вживає,
 * решту лишаємо як текст.
 */
function renderBold(text: string) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i}>{part.slice(2, -2)}</strong>
    ) : (
      part
    ),
  );
}

// Тривалість від'їзду проєктора за лівий край (див. .is-leaving у CSS)
const LEAVE_MS = 550;

/** Швидкість «друку» відповіді: символів за тик і період тика */
const TYPE_CHARS = 4;
const TYPE_MS = 20;

/**
 * Відповідь друкується на тому самому місці, де щойно світив проєктор.
 * Друкуємо по «плоскій» версії тексту (без **зірочок**), інакше маркери
 * жирного миготіли б сирими; готовий текст підміняється на версію з <strong>.
 */
function TypedText({ text, onDone }: { text: string; onDone: () => void }) {
  const plain = useMemo(() => text.replace(/\*\*/g, ''), [text]);
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    let n = 0;
    const timer = setInterval(() => {
      n += TYPE_CHARS;
      if (n >= plain.length) {
        clearInterval(timer);
        setShown(plain.length);
        onDone();
        return;
      }
      setShown(n);
      // Бульбашка росте — низ їде слідом за кожним тиком друку
      const scroller = ref.current?.closest('.chat-msgs');
      if (scroller) scroller.scrollTop = scroller.scrollHeight;
    }, TYPE_MS);
    return () => clearInterval(timer);
    // onDone навмисно поза залежностями: перезапуск друку від зміни колбека не потрібен
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plain]);

  return <p className="chat-bub" ref={ref}>{plain.slice(0, shown)}</p>;
}

type Phase = 'loading' | 'leaving' | 'typing' | 'shown';

function Bubble({ message, isLast }: { message: ChatMessage; isLast: boolean }) {
  const { t } = useTranslation();
  const rowRef = useRef<HTMLDivElement>(null);

  const finished = Boolean(message.done || message.errorCode);

  // Оцінені плитки згортаються; коли зникає остання — самі просимо ще
  const [ratedIds, setRatedIds] = useState<number[]>([]);
  const askedMore = useRef(false);

  // Хореографія відповіді: проєктор світить, доки текст не дописано до кінця →
  // промінь гасне, корпус від'їжджає за лівий край → на його місці друкується
  // відповідь → після друку одна за одною випливають плитки фільмів.
  // Стара історія (готова на момент монтування) минає всі фази одразу.
  const [initiallyShown] = useState(finished);
  const [phase, setPhase] = useState<Phase>(finished ? 'shown' : 'loading');

  // Залежність рівно одна — finished. Якби тут стояла phase, перехід
  // 'loading'→'leaving' перезапустив би ефект, і cleanup прибив би таймер
  // раніше, ніж той спрацює: фаза застрягала б у 'leaving' назавжди —
  // з погашеним променем і корпусом за межами екрана, тобто порожнім чатом.
  useEffect(() => {
    if (!finished || initiallyShown) return;
    setPhase('leaving');
    const timer = setTimeout(() => {
      // Помилці й порожній відповіді друкувати нічого — одразу фінал
      setPhase(message.errorCode || !message.content ? 'shown' : 'typing');
    }, LEAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  // Всі плитки оцінені → автоматично просимо наступну порцію. Лише остання
  // відповідь у розмові й лише раз: guard-реф переживає ререндери.
  const allIds = splitTitleRefs(message.content).ids;
  useEffect(() => {
    if (!isLast || askedMore.current) return;
    if (allIds.length === 0 || ratedIds.length < allIds.length) return;
    askedMore.current = true;
    void useChatStore.getState().send(t('chat.moreRequest'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratedIds, isLast]);

  if (message.role === 'user') {
    return (
      <div className="chat-row chat-row--user">
        <p className="chat-bub chat-bub--user">{message.content}</p>
      </div>
    );
  }

  const thinking = phase === 'loading' || phase === 'leaving';
  const { text, ids } = splitTitleRefs(message.content);

  return (
    <div className="chat-row" ref={rowRef}>
      {/* Поки працює проєктор, ромб зайвий — двоє «представників» бота поруч.
          З'являється разом із відповіддю (або помилкою), коли лоадер зникає. */}
      {!thinking && (
      <span className="chat-ava" aria-hidden="true">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
          <path d="M10.2 5Q10.2 13.6 18.8 13.6Q10.2 13.6 10.2 22.2Q10.2 13.6 1.6 13.6Q10.2 13.6 10.2 5Z" />
          <path d="M18.6 1.5Q18.6 5.8 22.9 5.8Q18.6 5.8 18.6 10.1Q18.6 5.8 14.3 5.8Q18.6 5.8 18.6 1.5Z" />
        </svg>
      </span>
      )}

      <div className="chat-col">
        {thinking && <Thinking leaving={phase === 'leaving'} />}

        {phase === 'typing' && text && (
          <TypedText text={text} onDone={() => setPhase('shown')} />
        )}

        {phase === 'shown' && text && <p className="chat-bub">{renderBold(text)}</p>}

        {phase === 'shown' && ids.length > 0 && (
          <div className={`chat-cards${initiallyShown ? '' : ' chat-cards--anim'}`}>
            <AnimatePresence initial={false}>
              {ids.filter((id) => !ratedIds.includes(id)).map((id, i) => (
                <motion.div
                  key={id}
                  className="chat-card-slot"
                  style={{ animationDelay: `${i * 160}ms` }}
                  exit={{ opacity: 0, height: 0, scale: 0.92, marginBottom: -7 }}
                  transition={{ duration: 0.28, ease: 'easeIn' }}
                >
                  <TitleCard id={id} onRated={(r) => setRatedIds((prev) => [...prev, r])} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Один текст на будь-який збій: чим саме не змогли — справа логів,
            користувачу від різниці між кодами нічого не легшає. */}
        {phase === 'shown' && message.errorCode && (
          <p className="chat-err">
            <span aria-hidden="true">🎬</span>
            {t('chat.error')}
          </p>
        )}
      </div>
    </div>
  );
}
