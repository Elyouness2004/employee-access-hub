import { QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { createQueryClient } from '@/shared/api';

/**
 * TanStack Query provider over the production defaults in
 * shared/api/query-client.ts. No feature queries exist in Phase 1 — this is
 * the infrastructure later phases hook into.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
