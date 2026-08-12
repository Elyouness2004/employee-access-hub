/**
 * Full-page authentication status (boot restore, callback completion). The
 * shell must never flash before the session state is known — this renders
 * instead.
 *
 * No spinner: DESIGN-SYSTEM §9.4 allows spinners only inside controls, and
 * FRONTEND-SPECIFICATION P01 specifies exactly what this screen carries — the
 * product name and announced status text.
 */
export function AuthSplash({ status = 'Checking your session…' }: { status?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-canvas p-6" aria-busy="true">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="select-none text-panel-title text-ink-strong">Employee Access Hub</p>
        <p role="status" aria-live="polite" className="text-body text-ink-muted">
          {status}
        </p>
      </div>
    </main>
  );
}
