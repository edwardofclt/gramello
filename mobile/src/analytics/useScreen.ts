import { useEffect, useRef } from 'react';
import { trackScreen } from './client';
import type { ScreenName } from './events';

export function useAnalyticsScreen(name: ScreenName) {
  const previous = useRef<ScreenName | null>(null);
  useEffect(() => {
    if (previous.current === name) return;
    previous.current = name;
    trackScreen(name);
  }, [name]);
}
