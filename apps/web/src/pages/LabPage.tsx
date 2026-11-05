import type { ReactNode } from 'react';
import { useLabStore } from '../store/useLabStore';
import { ToolRail } from '../components/ToolRail';
import { ConfigPanel } from '../components/ConfigPanel';
import { CanvasPanel } from '../components/CanvasPanel';
import { Inspector } from '../components/Inspector';
import { Timeline } from '../components/Timeline';

export function LabPage(): ReactNode {
  const drawers = useLabStore((state) => state.drawers);
  const toggleDrawer = useLabStore((state) => state.toggleDrawer);
  const closeDrawers = () => {
    const state = useLabStore.getState();
    if (state.drawers.config) state.toggleDrawer('config');
    if (state.drawers.inspector) state.toggleDrawer('inspector');
  };

  return (
    <div
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
      <div className="lab-drawer-tools" aria-label="面板开关">
        <button className={drawers.config ? 'active' : ''} onClick={() => toggleDrawer('config')} aria-pressed={drawers.config}>
          ⚙ 配置
        </button>
        <button className={drawers.inspector ? 'active' : ''} onClick={() => toggleDrawer('inspector')} aria-pressed={drawers.inspector}>
          ◧ Inspector
        </button>
      </div>
      {(drawers.config || drawers.inspector) && (
        <div className="drawer-backdrop" onClick={closeDrawers} aria-hidden="true" />
      )}
    </div>
  );
}
