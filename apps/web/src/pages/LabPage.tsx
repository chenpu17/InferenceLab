import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLabStore } from '../store/useLabStore';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useI18n } from '../i18n';
import { ToolRail } from '../components/ToolRail';
import { ConfigPanel } from '../components/ConfigPanel';
import { CanvasPanel } from '../components/CanvasPanel';
import { Inspector } from '../components/Inspector';
import { Timeline } from '../components/Timeline';
import { Icon } from '../components/ui/Icon';

export function LabPage(): ReactNode {
  const drawers = useLabStore((state) => state.drawers);
  const toggleDrawer = useLabStore((state) => state.toggleDrawer);
  const { t } = useI18n();
  const layoutRef = useRef<HTMLDivElement>(null);
  const configDrawerRef = useRef<HTMLElement>(null);
  const inspectorDrawerRef = useRef<HTMLElement>(null);
  const [drawerMode, setDrawerMode] = useState(() => window.matchMedia('(max-width: 1280px)').matches);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1280px)');
    const onChange = (event: MediaQueryListEvent) => setDrawerMode(event.matches);
    setDrawerMode(media.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const closeDrawers = () => {
    const state = useLabStore.getState();
    if (state.drawers.config) state.toggleDrawer('config');
    if (state.drawers.inspector) state.toggleDrawer('inspector');
  };

  useLayoutEffect(() => {
    configDrawerRef.current = layoutRef.current?.querySelector<HTMLElement>('[data-testid="config-panel"]') ?? null;
    inspectorDrawerRef.current = layoutRef.current?.querySelector<HTMLElement>('[data-testid="inspector"]') ?? null;
    for (const [drawer, open] of [
      [configDrawerRef.current, drawers.config],
      [inspectorDrawerRef.current, drawers.inspector],
    ] as const) {
      if (!drawer) continue;
      drawer.inert = drawerMode && !open;
    }
  }, [drawerMode, drawers.config, drawers.inspector]);

  useFocusTrap(drawerMode && drawers.config, configDrawerRef, closeDrawers);
  useFocusTrap(drawerMode && drawers.inspector, inspectorDrawerRef, closeDrawers);

  return (
    <div
      ref={layoutRef}
      className={[
        'lab-layout',
        drawers.config ? 'drawer-config-open' : '',
        drawers.inspector ? 'drawer-inspector-open' : '',
      ].join(' ')}
    >
      <div className="lab-main">
        <ToolRail />
        <ConfigPanel />
        <CanvasPanel />
        <Inspector />
      </div>
      <Timeline />
      <div className="lab-drawer-tools" aria-label={t('面板开关')}>
        <button className={drawers.config ? 'active' : ''} onClick={() => toggleDrawer('config')} aria-pressed={drawers.config}>
          <Icon name="settings" /> {t('配置')}
        </button>
        <button className={drawers.inspector ? 'active' : ''} onClick={() => toggleDrawer('inspector')} aria-pressed={drawers.inspector}>
          <Icon name="inspector" /> {t('检查器')}
        </button>
      </div>
      {(drawers.config || drawers.inspector) && (
        <div className="drawer-backdrop" onClick={closeDrawers} aria-hidden="true" />
      )}
    </div>
  );
}
