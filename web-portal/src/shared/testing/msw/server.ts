import { setupServer } from 'msw/node';

import { defaultHandlers } from './handlers';

/**
 * One MSW server for all tests, pre-loaded with the happy path for every
 * endpoint the app calls. Tests narrow it per case with `server.use(...)`.
 */
export const server = setupServer(...defaultHandlers);
