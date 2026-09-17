import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'dark' | 'light';
type Locale = 'uk' | 'en';

interface UIState {
  theme: Theme;
  locale: Locale;
  filterDrawerOpen: boolean;
  chatOpen: boolean;
  toggleTheme: () => void;
  setLocale: (locale: Locale) => void;
  setFilterDrawerOpen: (open: boolean) => void;
  setChatOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      locale: 'uk',
      filterDrawerOpen: false,
      chatOpen: false,

      toggleTheme: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        set({ theme: next });
      },

      setLocale: (locale) => set({ locale }),

      setFilterDrawerOpen: (open) => set({ filterDrawerOpen: open }),

      setChatOpen: (open) => set({ chatOpen: open }),
    }),
    {
      name: 'pickme-ui',
      partialize: (state) => ({
        theme: state.theme,
        locale: state.locale,
      }),
    },
  ),
);
