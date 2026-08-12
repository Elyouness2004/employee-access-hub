import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { IconButton } from '@/shared/components/ui';
import { cn } from '@/shared/lib/cn';

/**
 * A technical identifier presented as what it is: machine data you copy, not an
 * identity you read.
 *
 * Every surface that shows a UUID shows it for one reason — somebody is about to
 * paste it into a log query, a ticket or a support message. Selecting 36
 * characters of mono text by hand is the part that goes wrong, so the copy
 * action is part of the component rather than an affordance each page
 * remembers to add.
 *
 * The outcome is announced politely: a clipboard write is invisible, and a user
 * who cannot see the icon change has no other way to know it worked. Failure is
 * announced too — a denied clipboard permission must not look like success.
 */
export interface CopyableIdProps {
  value: string;
  /** What is being copied, for the button's accessible name. */
  label: string;
  className?: string;
}

export function CopyableId({ value, label, className }: CopyableIdProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      // Denied permission, an insecure context, or no clipboard API at all.
      // Saying so beats a checkmark over an empty clipboard.
      setState('failed');
    }
    timer.current = setTimeout(() => setState('idle'), 4000);
  };

  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5', className)}>
      <span className="min-w-0 break-all font-mono text-mono">{value}</span>
      <IconButton
        size="compact"
        label={state === 'copied' ? `${label} copied` : `Copy ${label.toLowerCase()}`}
        className="shrink-0"
        onClick={() => void copy()}
      >
        {state === 'copied' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </IconButton>
      <span aria-live="polite" className="sr-only">
        {state === 'copied' ? `${label} copied to the clipboard` : null}
        {state === 'failed' ? `${label} could not be copied — select and copy it manually` : null}
      </span>
    </span>
  );
}
