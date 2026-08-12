import { HttpResponse } from 'msw';

import type { ProblemDetailBody } from '@/shared/api';

/**
 * RFC 7807 response builder speaking the services' real error contract
 * (api-conventions §4): application/problem+json body + X-Correlation-Id
 * header on every response.
 */
export function problemResponse(
  status: number,
  body: Omit<ProblemDetailBody, 'status'>,
  correlationId = 'corr-test-0001',
) {
  return HttpResponse.json(
    { status, ...body },
    {
      status,
      headers: {
        'Content-Type': 'application/problem+json',
        'X-Correlation-Id': correlationId,
      },
    },
  );
}
