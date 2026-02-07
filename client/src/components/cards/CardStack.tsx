import { useTranslation } from 'react-i18next';
import SwipeCard from './SwipeCard';
import EmptyState from '@/components/ui/EmptyState';
import Spinner from '@/components/ui/Spinner';
import type { FeedCard } from '@/types';

interface CardStackProps {
  cards: FeedCard[];
  onSwipe: (cardId: number, direction: 'left' | 'right' | 'up') => void;
  isLoading: boolean;
}

export default function CardStack({ cards, onSwipe, isLoading }: CardStackProps) {
  const { t } = useTranslation();

  if (isLoading && cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size={32} />
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
          </svg>
        }
        message={t('feed.noMore')}
        hint={t('feed.noMoreHint')}
      />
    );
  }

  const visibleCards = cards.slice(0, 3);

  return (
    <div className="relative w-full h-full flex items-start justify-center pt-2">
      {visibleCards
        .slice()
        .reverse()
        .map((card, reverseIndex) => {
          const stackIndex = visibleCards.length - 1 - reverseIndex;
          return (
            <SwipeCard
              key={card.id}
              card={card}
              isTop={stackIndex === 0}
              stackIndex={stackIndex}
              onSwipe={(direction) => onSwipe(card.id, direction)}
            />
          );
        })}
    </div>
  );
}
