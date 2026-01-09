import { useCallback, useEffect, useRef } from 'react';

type TimeoutHandle = ReturnType<typeof setTimeout>;

export const useDebouncedCallback = <Args extends unknown[]>(
  callback: (...args: Args) => void,
  delayMs: number,
): {
  debounced: (...args: Args) => void;
  cancel: () => void;
} => {
  const callbackRef = useRef(callback);
  const timeoutRef = useRef<TimeoutHandle | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const cancel = useCallback(() => {
    if (!timeoutRef.current) return;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const debounced = useCallback(
    (...args: Args) => {
      cancel();
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        callbackRef.current(...args);
      }, delayMs);
    },
    [cancel, delayMs],
  );

  useEffect(() => cancel, [cancel]);

  return { debounced, cancel };
};

