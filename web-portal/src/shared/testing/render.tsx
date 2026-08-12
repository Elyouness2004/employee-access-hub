import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
  type RouteObject,
} from 'react-router-dom';

import {
  IdentityProvider,
  SessionControlsProvider,
  type Identity,
  type Role,
  type SessionControls,
} from '@/shared/auth';
import { TooltipProvider } from '@/shared/components/ui';
import { ThemeProvider } from '@/shared/theme/ThemeProvider';

import { EXPANDED_ROLES } from './msw/fixtures';

/**
 * The ONLY render helpers tests use: providers (query client with retries off,
 * identity fixture, theme, tooltips) plus a router. `renderWithProviders`
 * wraps a component in a MemoryRouter; `renderWithRouter` mounts a full route
 * tree (tests pass `appRoutes` from the app layer — shared/testing never
 * imports app code itself).
 */

export interface ProviderOptions {
  /** Identity fixture role; the identity carries its composite expansion. */
  role?: Role;
  /** Full identity override for edge cases. */
  identity?: Identity;
  /**
   * Session controls, mirroring production (real sign-out exists). Pass a
   * spy to assert sign-out wiring, or `null` to reproduce the dev mock
   * identity (no real session).
   */
  sessionControls?: SessionControls | null;
  /**
   * Share one cache across several mounts. Needed to prove that something
   * survives an unmount — a component's own state cannot, so a value that has
   * to outlive the component belongs in the cache, and this is how a test says
   * so. Omit it and each render gets a fresh client, as before.
   */
  queryClient?: QueryClient;
}

export function identityFixture(role: Role = 'EMPLOYEE'): Identity {
  return {
    subject: `test-subject-${role.toLowerCase()}`,
    username: `test.${role.toLowerCase()}`,
    displayName: `Test ${role.charAt(0) + role.slice(1).toLowerCase()}`,
    roles: EXPANDED_ROLES[role],
  };
}

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function Providers({ options, children }: { options: ProviderOptions; children: ReactNode }) {
  const identity = options.identity ?? identityFixture(options.role);
  const controls =
    options.sessionControls === undefined ? { signOut: () => undefined } : options.sessionControls;
  const tree = (
    <QueryClientProvider client={options.queryClient ?? createTestQueryClient()}>
      <TooltipProvider delayDuration={0}>{children}</TooltipProvider>
    </QueryClientProvider>
  );
  return (
    <ThemeProvider>
      <IdentityProvider identity={identity}>
        {controls ? (
          <SessionControlsProvider controls={controls}>{tree}</SessionControlsProvider>
        ) : (
          tree
        )}
      </IdentityProvider>
    </ThemeProvider>
  );
}

export function renderWithProviders(
  ui: ReactElement,
  options: ProviderOptions & { route?: string } & Omit<RenderOptions, 'wrapper'> = {},
): RenderResult {
  const { role, identity, sessionControls, queryClient, route = '/', ...renderOptions } = options;
  return render(ui, {
    wrapper: ({ children }) => (
      <Providers options={{ role, identity, sessionControls, queryClient }}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </Providers>
    ),
    ...renderOptions,
  });
}

/**
 * Render one page AT a route pattern, so `useParams`/`useSearchParams` behave
 * as they do in the app.
 *
 * Feature tests use this rather than importing the app's route tree: a feature
 * may not import from `app/*` (FRONTEND-ARCHITECTURE §14), and a detail page
 * needs only its own pattern — pulling in every route to get `:id` would couple
 * the test to routing decisions it is not about.
 */
export function renderAtRoute(
  pattern: string,
  element: ReactElement,
  options: ProviderOptions & { route: string },
): RenderResult & { router: ReturnType<typeof createMemoryRouter> } {
  const { route, ...providerOptions } = options;
  return renderWithRouter([{ path: pattern, element }], { ...providerOptions, route });
}

export function renderWithRouter(
  routes: RouteObject[],
  options: ProviderOptions & { route?: string } = {},
): RenderResult & { router: ReturnType<typeof createMemoryRouter> } {
  const { route = '/', ...providerOptions } = options;
  const router = createMemoryRouter(routes, { initialEntries: [route] });
  const result = render(
    <Providers options={providerOptions}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return { ...result, router };
}
