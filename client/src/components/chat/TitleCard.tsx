import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useContentDetail, useSwipe, useToggleBookmark } from '@/api/hooks';
import { useUIStore } from '@/stores/uiStore';
import { tmdbPoster } from '@/utils/image';
import { LikeIcon, DislikeIcon } from '@/components/ui/icons';

interface TitleCardProps {
  id: number;
  /** Викликається після оцінки — батько згортає плитку і рахує, чи лишились ще */
  onRated?: (id: number) => void;
}

/**
 * Постерна картка під відповіддю бота, з лайком і дизлайком прямо на ній.
 *
 * Оцінка йде тим самим /feed/swipe, що й свайп у стрічці: тренує рекомендації
 * і позначає тайтл переглянутим. Дані тягнемо тим самим хуком, що й сторінка
 * тайтла, тож TanStack Query віддає їх із кешу, якщо фільм уже траплявся.
 */
export default function TitleCard({ id, onRated }: TitleCardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const setChatOpen = useUIStore((s) => s.setChatOpen);
  const { data, isLoading } = useContentDetail(id);
  const swipe = useSwipe();
  const toggleBookmark = useToggleBookmark();

  if (isLoading) {
    return <div className="chat-card chat-card--skeleton" aria-hidden="true" />;
  }
  if (!data) return null;

  const year = data.releaseDate ? data.releaseDate.slice(0, 4) : null;

  const rate = (action: 'like' | 'dislike') => {
    // Оптимістично: плитка згортається одразу, не чекаючи на мережу
    swipe.mutate({ contentId: id, action });
    onRated?.(id);
  };

  const save = () => {
    // Закладка теж «закриває питання» по плитці: фільм відкладено, тож вона
    // згортається і рахується розібраною — нарівні з оцінкою
    toggleBookmark.mutate(id);
    onRated?.(id);
  };

  const open = () => {
    // Чат ховається, але розмова лишається в сторі; сторінка фільму
    // знає, що прийшли з чату, і її «назад» поверне з відкритим чатом
    setChatOpen(false);
    navigate(`/content/${id}`, { state: { fromChat: true } });
  };

  return (
    <div
      className="chat-card"
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => { if (e.key === 'Enter') open(); }}
    >
      <img
        src={tmdbPoster(data.posterPath, 'w154')}
        alt=""
        loading="lazy"
        className="chat-card__poster"
      />
      <span className="chat-card__body">
        <span className="chat-card__title">{data.title}</span>
        <span className="chat-card__meta">
          {year}
          {data.imdbRating != null && (
            <>
              {' · '}
              <b>★ {data.imdbRating.toFixed(1)}</b>
            </>
          )}
        </span>
      </span>
      <span className="chat-card__acts" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="chat-card__act chat-card__act--like"
          aria-label={t('chat.rateLike')}
          title={t('chat.rateLike')}
          onClick={() => rate('like')}
        >
          <LikeIcon size={15} />
        </button>
        <button
          type="button"
          className="chat-card__act chat-card__act--dislike"
          aria-label={t('chat.rateDislike')}
          title={t('chat.rateDislike')}
          onClick={() => rate('dislike')}
        >
          <DislikeIcon size={15} />
        </button>
        <button
          type="button"
          className="chat-card__act chat-card__act--save"
          aria-label={t('chat.rateSave')}
          title={t('chat.rateSave')}
          onClick={save}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      </span>
    </div>
  );
}
