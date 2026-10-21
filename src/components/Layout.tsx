import type { ReactNode } from 'react';
import { routeHref, type Route } from '../app/router';
import { LogoMark } from './Icons';

const NAV: { label: string; route: Route; matches: Route['name'][] }[] = [
  { label: 'Practice', route: { name: 'setup', mode: 'practice' }, matches: ['practice', 'practice-summary'] },
  { label: 'Test', route: { name: 'setup', mode: 'test' }, matches: ['test', 'test-results'] },
  { label: 'About', route: { name: 'about' }, matches: ['about'] },
];

function isCurrent(item: (typeof NAV)[number], route: Route): boolean {
  if (item.route.name === 'setup' && route.name === 'setup') return item.route.mode === route.mode;
  return item.matches.includes(route.name);
}

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  return (
    <div className="app">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main')?.focus(); }}>
        Skip to content
      </a>
      <header className="site-header">
        <div className="site-header__inner">
          <a href={routeHref({ name: 'home' })} className="brand" aria-label="StudySAT home">
            <LogoMark size={30} />
            <span className="brand__name">StudySAT</span>
          </a>
          <nav aria-label="Main">
            <ul className="nav">
              {NAV.map((item) => (
                <li key={item.label}>
                  <a href={routeHref(item.route)} className="nav__link" aria-current={isCurrent(item, route) ? 'page' : undefined}>
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main id="main" className="site-main" tabIndex={-1}>
        {children}
      </main>
      <footer className="site-footer">
        <p>
          Questions and explanations © College Board, loaded live from the{' '}
          <a href="https://satsuiteeducatorquestionbank.collegeboard.org/" target="_blank" rel="noopener noreferrer">
            SAT Suite Question Bank
          </a>
          . SAT is a trademark registered by College Board, which is not affiliated with and does not endorse this project.
        </p>
        <p>
          StudySAT is open-source software under the MIT License. <a href={routeHref({ name: 'about' })}>About &amp; licensing</a>
        </p>
      </footer>
    </div>
  );
}
