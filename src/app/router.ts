import { useCallback, useEffect, useState } from 'react';

/**
 * Minimal hash-based routing. Hash URLs work on any static host (including
 * GitHub Pages) without server rewrites, and give us working back/forward
 * buttons without a routing dependency.
 */

export type Route =
  | { name: 'home' }
  | { name: 'setup'; mode: 'practice' | 'test' }
  | { name: 'practice' }
  | { name: 'practice-summary' }
  | { name: 'test' }
  | { name: 'test-results' }
  | { name: 'about' }
  | { name: 'not-found' };

export function parseRoute(hash: string): Route {
  const path = hash.replace(/^#/, '').replace(/\/+$/, '') || '/';
  switch (path) {
    case '/':
      return { name: 'home' };
    case '/practice/setup':
      return { name: 'setup', mode: 'practice' };
    case '/test/setup':
      return { name: 'setup', mode: 'test' };
    case '/practice':
      return { name: 'practice' };
    case '/practice/summary':
      return { name: 'practice-summary' };
    case '/test':
      return { name: 'test' };
    case '/test/results':
      return { name: 'test-results' };
    case '/about':
      return { name: 'about' };
    default:
      return { name: 'not-found' };
  }
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'setup':
      return `#/${route.mode}/setup`;
    case 'practice':
      return '#/practice';
    case 'practice-summary':
      return '#/practice/summary';
    case 'test':
      return '#/test';
    case 'test-results':
      return '#/test/results';
    case 'about':
      return '#/about';
    case 'not-found':
      return '#/';
  }
}

export function navigate(route: Route, { replace = false } = {}): void {
  const href = routeHref(route);
  if (replace) {
    history.replaceState(null, '', href);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = href.slice(1);
  }
}

export function useRoute(): [Route, typeof navigate] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const go = useCallback<typeof navigate>((r, options) => navigate(r, options), []);
  return [route, go];
}
