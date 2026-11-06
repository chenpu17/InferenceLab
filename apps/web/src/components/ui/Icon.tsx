import type { ReactNode, SVGProps } from 'react';

export type IconName =
  | 'topology'
  | 'memory'
  | 'scheduler'
  | 'transport'
  | 'metrics'
  | 'help'
  | 'play'
  | 'pause'
  | 'reset'
  | 'step'
  | 'next'
  | 'collapse'
  | 'expand'
  | 'settings'
  | 'inspector'
  | 'theme'
  | 'motion'
  | 'more'
  | 'run'
  | 'close'
  | 'menu'
  | 'globe'
  | 'arrow'
  | 'search'
  | 'compare'
  | 'reference'
  | 'experiment';

const ICONS: Record<IconName, ReactNode> = {
  topology: (
    <>
      <path d="M12 7v5M6 17l6-5 6 5" />
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="5" cy="19" r="2.5" />
      <circle cx="19" cy="19" r="2.5" />
    </>
  ),
  memory: (
    <>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" />
    </>
  ),
  scheduler: (
    <>
      <circle cx="5" cy="6" r="1" />
      <circle cx="5" cy="12" r="1" />
      <circle cx="5" cy="18" r="1" />
      <path d="M9 6h10M9 12h7M9 18h10" />
    </>
  ),
  transport: (
    <>
      <path d="M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4" />
    </>
  ),
  metrics: (
    <>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.7 9a2.4 2.4 0 0 1 4.65.8c0 1.8-2.35 2-2.35 3.7M12 17h.01" />
    </>
  ),
  play: <path d="m9 6 9 6-9 6Z" />,
  pause: <path d="M9 6v12M15 6v12" />,
  reset: (
    <>
      <path d="M4 10a8 8 0 1 1 2.35 7.65M4 4v6h6" />
    </>
  ),
  step: (
    <>
      <path d="m6 6 8 6-8 6ZM18 6v12" />
    </>
  ),
  next: <path d="m9 6 6 6-6 6" />,
  collapse: <path d="m6 15 6-6 6 6" />,
  expand: <path d="m6 9 6 6 6-6" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.6-1H3v-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6V3h4v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.6 1h.09v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  inspector: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M14 4v16M17 8h1M17 12h1M17 16h1M6 8h5M6 12h5" />
    </>
  ),
  theme: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41" />
    </>
  ),
  motion: <path d="M3 12h3l2-6 4 12 2-6h3l2 3h2" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  run: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8 6 4-6 4Z" />
    </>
  ),
  close: <path d="m6 6 12 12M18 6 6 18" />,
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
    </>
  ),
  arrow: <path d="M4 12h16M14 6l6 6-6 6" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  compare: (
    <>
      <path d="M7 3 3 7l4 4M3 7h14M17 21l4-4-4-4M21 17H7" />
    </>
  ),
  reference: (
    <>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H11v18H6.5A2.5 2.5 0 0 0 4 22ZM20 4.5A2.5 2.5 0 0 0 17.5 2H13v18h4.5A2.5 2.5 0 0 1 20 22Z" />
    </>
  ),
  experiment: (
    <>
      <path d="M9 3h6M10 3v6l-5.5 9.5A1.8 1.8 0 0 0 6 21h12a1.8 1.8 0 0 0 1.5-2.5L14 9V3M7.5 15h9" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  size?: number | string;
}

export function Icon({
  name,
  size = 18,
  className,
  'aria-hidden': ariaHidden = true,
  ...props
}: IconProps): ReactNode {
  return (
    <svg
      {...props}
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={ariaHidden}
      focusable="false"
    >
      {ICONS[name]}
    </svg>
  );
}
