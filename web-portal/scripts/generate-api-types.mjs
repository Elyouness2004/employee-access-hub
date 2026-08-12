#!/usr/bin/env node
/**
 * Generate DTO types from each service's live OpenAPI document
 * (FRONTEND-ARCHITECTURE §1: DTO types are generated, never hand-written).
 *
 * Requires the backend running locally (services on their direct ports).
 * Output: src/shared/types/generated/<service>.ts — committed, so the app
 * builds without a running backend. Re-run whenever a backend contract
 * changes.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const services = [
  { name: 'hr', port: 9001 },
  { name: 'leave', port: 9002 },
  { name: 'expense', port: 9003 },
  { name: 'document', port: 9004 },
  { name: 'analytics', port: 9005 },
];

const outDir = path.resolve(import.meta.dirname, '../src/shared/types/generated');
mkdirSync(outDir, { recursive: true });

let failures = 0;
for (const { name, port } of services) {
  const url = `http://localhost:${port}/v3/api-docs`;
  const outFile = path.join(outDir, `${name}.ts`);
  process.stdout.write(`Generating ${name} types from ${url} … `);
  try {
    execFileSync('npx', ['openapi-typescript', url, '-o', outFile], { stdio: 'pipe' });
    console.log('ok');
  } catch {
    failures += 1;
    console.log('FAILED (is the service running?)');
  }
}

if (failures > 0) {
  console.error(
    `\n${failures} service(s) unreachable. Start the backend (see docker/scripts/e2e-local.sh) and re-run.`,
  );
  process.exit(1);
}
