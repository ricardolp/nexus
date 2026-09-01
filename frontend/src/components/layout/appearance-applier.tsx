import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

import { useAuthStore } from '@/store/auth-store';

type Density = 'compact' | 'comfortable' | 'spacious';
type FontSize = 'sm' | 'md' | 'lg' | 'xl';

const accents = new Set(['violet', 'blue', 'magenta', 'teal', 'amber']);

export function AppearanceApplier() {
  const appearance = useAuthStore((s) => s.user?.appearance);
  const { setTheme } = useTheme();
  const lastTheme = useRef<string | null>(null);

  const theme = typeof appearance?.theme === 'string' ? appearance.theme : null;
  const density = (appearance?.density as Density | undefined) ?? 'comfortable';
  const fontSize = (appearance?.font_size as FontSize | undefined) ?? 'md';
  const accent = typeof appearance?.accent === 'string' ? appearance.accent : 'violet';

  useEffect(() => {
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      if (lastTheme.current !== theme) {
        lastTheme.current = theme;
        setTheme(theme);
      }
    }
    document.documentElement.dataset.density = density;
    document.documentElement.dataset.fontSize = fontSize;
    if (accents.has(accent) && accent !== 'violet') {
      document.documentElement.dataset.accent = accent;
    } else {
      delete document.documentElement.dataset.accent;
    }
  }, [theme, density, fontSize, accent, setTheme]);

  return null;
}
