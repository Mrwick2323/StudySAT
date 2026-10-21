import { useEffect } from 'react';
import { AppProviders } from './app/AppProviders';
import { useRoute, type Route } from './app/router';
import { StatusPanel } from './components/Feedback';
import { Layout } from './components/Layout';
import type { QuestionRepository } from './data/repository';
import { AboutScreen } from './screens/AboutScreen';
import { HomeScreen } from './screens/HomeScreen';
import { PracticeScreen } from './screens/PracticeScreen';
import { PracticeSummaryScreen } from './screens/PracticeSummaryScreen';
import { SetupScreen } from './screens/setup/SetupScreen';
import { TestResultsScreen } from './screens/TestResultsScreen';
import { TestScreen } from './screens/TestScreen';

const TITLES: Record<Route['name'], string> = {
  home: 'StudySAT · Free SAT practice',
  setup: 'Set up · StudySAT',
  practice: 'Endless Practice · StudySAT',
  'practice-summary': 'Practice summary · StudySAT',
  test: 'Custom Test · StudySAT',
  'test-results': 'Test results · StudySAT',
  about: 'About · StudySAT',
  'not-found': 'Page not found · StudySAT',
};

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'home':
      return <HomeScreen />;
    case 'setup':
      return <SetupScreen key={route.mode} mode={route.mode} />;
    case 'practice':
      return <PracticeScreen />;
    case 'practice-summary':
      return <PracticeSummaryScreen />;
    case 'test':
      return <TestScreen />;
    case 'test-results':
      return <TestResultsScreen />;
    case 'about':
      return <AboutScreen />;
    case 'not-found':
      return (
        <div className="page">
          <StatusPanel
            title="Page not found"
            actions={
              <a className="btn btn--primary" href="#/">
                Go home
              </a>
            }
          />
        </div>
      );
  }
}

function Routes() {
  const [route] = useRoute();
  useEffect(() => {
    document.title = TITLES[route.name];
    window.scrollTo(0, 0);
  }, [route]);
  return (
    <Layout route={route}>
      <Screen route={route} />
    </Layout>
  );
}

export function App({ repository }: { repository?: QuestionRepository }) {
  return (
    <AppProviders repository={repository}>
      <Routes />
    </AppProviders>
  );
}
