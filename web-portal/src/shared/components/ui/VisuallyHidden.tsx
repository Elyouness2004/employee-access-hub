import type { HTMLAttributes } from 'react';

/** Screen-reader-only content (labels for icon-only controls, live text). */
export function VisuallyHidden(props: HTMLAttributes<HTMLSpanElement>) {
  return <span className="sr-only" {...props} />;
}
