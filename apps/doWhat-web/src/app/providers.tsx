'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { SavedActivitiesProvider } from '@/contexts/SavedActivitiesContext';

export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: 2,
            staleTime: 60_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      <SavedActivitiesProvider>{children}</SavedActivitiesProvider>
    </QueryClientProvider>
  );
}
