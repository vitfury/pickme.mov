import { Outlet, useLocation } from 'react-router-dom';
import BottomNav from './BottomNav';
import TopBar from './TopBar';
import FilterDrawer from '@/components/filters/FilterDrawer';

const FEED_PATH = '/';

export default function PageShell() {
  const location = useLocation();
  const isFeed = location.pathname === FEED_PATH;

  return (
    <div className="flex flex-col h-full">
      {isFeed && <TopBar />}
      <main className={isFeed ? 'flex-1' : 'flex-1 overflow-y-auto pb-16'}>
        <Outlet />
      </main>
      <BottomNav />
      {isFeed && <FilterDrawer />}
    </div>
  );
}
