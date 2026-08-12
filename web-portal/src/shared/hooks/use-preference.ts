import { useCallback, useState } from 'react';

/**
 * UI preferences live in localStorage behind this hook — one of the four
 * approved state homes (FRONTEND-ARCHITECTURE §1). Never tokens, never server
 * data. Values are JSON-serialized under a namespaced key.
 */

const NAMESPACE = 'eah:';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(NAMESPACE + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function usePreference<T>(key: string, fallback: T): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => read(key, fallback));

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(NAMESPACE + key, JSON.stringify(next));
      } catch {
        // Storage may be unavailable (private mode); the in-memory value stands.
      }
    },
    [key],
  );

  return [value, update];
}
