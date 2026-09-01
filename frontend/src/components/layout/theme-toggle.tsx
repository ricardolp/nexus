import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { MoonIcon, SunIcon } from 'lucide-react';

import { updateMe } from '@/lib/endpoints';
import { useAuthStore } from '@/store/auth-store';
import { Button } from '@/components/ui/button';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const setUserProfile = useAuthStore((s) => s.setUserProfile);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <Button variant="ghost" size="icon" className="rounded-full" disabled aria-hidden />;
  }

  const isDark = resolvedTheme === 'dark';

  async function toggleTheme() {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    if (!token || !user) return;
    try {
      const updated = await updateMe(token, {
        appearance_json: { ...(user.appearance ?? {}), theme: next }
      });
      setUserProfile(updated);
    } catch {
      // next-themes already persisted locally
    }
  }

  return (
    <Button variant="ghost" size="icon" className="rounded-full" onClick={() => void toggleTheme()}>
      {isDark ? <SunIcon /> : <MoonIcon />}
      <span className="sr-only">Alternar tema</span>
    </Button>
  );
}
