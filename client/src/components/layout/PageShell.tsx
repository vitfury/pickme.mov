import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import TopBar from './TopBar';
import FilterDrawer from '@/components/filters/FilterDrawer';
import { useUIStore } from '@/stores/uiStore';
import ChatSheet from '@/components/chat/ChatSheet';

const FEED_PATH = '/';

export default function PageShell() {
  const location = useLocation();
  const isFeed = location.pathname === FEED_PATH;
  // Поки чат відкритий, скролер сторінки замкнений: iOS уміє дотягтись до
  // нього крізь оверлей (ланцюжок скролу, панорамування при клавіатурі)
  const chatOpen = useUIStore((s) => s.chatOpen);

  return (
    <div className="flex flex-col h-full safe-top">
      {isFeed && <TopBar />}
      {/* pb-25 = 100px: верхівка ромба ШІ сягає ~92px від низу екрана */}
      <main className={isFeed ? 'flex-1 min-h-0' : `flex-1 pb-25 ${chatOpen ? 'overflow-hidden' : 'overflow-y-auto'}`}>
        <Outlet />
      </main>
      <BottomNav />
      {isFeed && <FilterDrawer />}
      <ChatSheet />
    </div>
  );
}
