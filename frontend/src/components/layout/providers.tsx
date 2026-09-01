import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';

import { ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/auth-store';
import { AppearanceApplier } from '@/components/layout/appearance-applier';
import { ThemeProvider } from '@/components/layout/theme-provider';
import { Toaster } from '@/components/ui/sonner';

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        void useAuthStore.getState().refreshSession().then((ok) => {
          if (!ok) useAuthStore.getState().signOut();
        });
      }
    }
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          return false;
        }
        return failureCount < 2;
      }
    }
  }
});

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    void useAuthStore.getState().hydrateSession();
    const timer = window.setInterval(() => {
      if (useAuthStore.getState().user) {
        void useAuthStore.getState().refreshSession();
      }
    }, 4 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppearanceApplier />
        {children}
        <Toaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
