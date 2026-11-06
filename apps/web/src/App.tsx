import { useEffect, type ReactNode } from 'react';
import { Header } from './components/Header';
import { usePlayback } from './hooks/usePlayback';
import { useLabStore, type Route } from './store/useLabStore';
import { LabPage } from './pages/LabPage';
import { ExperimentsPage } from './pages/ExperimentsPage';
import { ReferencePage } from './pages/ReferencePage';
import { t } from './i18n';

function routeFromHash(): Route {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash.startsWith('experiments')) return 'experiments';
  if (hash.startsWith('reference')) return 'reference';
  return 'lab';
}

export function App(): ReactNode {
  const route = useLabStore((state) => state.route);
  const theme = useLabStore((state) => state.theme);
  const locale = useLabStore((state) => state.locale);
  const reducedMotion = useLabStore((state) => state.reducedMotion);

  usePlayback();

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.motion = reducedMotion ? 'reduced' : 'full';
    root.lang = locale === 'zh' ? 'zh-CN' : 'en';
    root.style.colorScheme = theme;
    document.title = t('InferenceLab · 推理机制实验室', undefined, locale);
  }, [theme, locale, reducedMotion]);

  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/lab');
    }
    const onHashChange = () => {
      const next = routeFromHash();
      if (next !== useLabStore.getState().route) useLabStore.setState({ route: next });
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    const state = useLabStore.getState();
    if (state.planStatus === 'idle' || (!state.planPreview && state.planStatus !== 'planning')) {
      void state.planNow();
    }
  }, []);

  return (
    <div className="app-shell">
      <Header />
      {route === 'lab' && <LabPage />}
      {route === 'experiments' && <ExperimentsPage />}
      {route === 'reference' && <ReferencePage />}
    </div>
  );
}
