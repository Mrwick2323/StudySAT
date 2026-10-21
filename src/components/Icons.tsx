import type { SVGProps } from 'react';

/** Small inline icons. Decorative by default; pass `aria-label` + role="img" to make one meaningful. */
type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={props['aria-label'] ? undefined : true}
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" strokeWidth={2.6} />
  </Icon>
);

export const CrossIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" strokeWidth={2.6} />
  </Icon>
);

export const MinusCircleIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 12h7" />
  </Icon>
);

export const FlameIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3c.5 3.2 4.5 5.4 4.5 10A4.5 4.5 0 0 1 12 17.5 4.5 4.5 0 0 1 7.5 13c0-2 1-3.4 2-4.3.3 1.6 1 2.6 2 3C11 9 11.2 5.6 12 3z" fill="currentColor" stroke="none" />
    <path d="M12 21a6.5 6.5 0 0 0 6.5-6.5" strokeWidth={1.6} opacity={0.5} />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
  </Icon>
);

export const BoltIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 2L4.5 13.5H11L10 22l9.5-12H13z" fill="currentColor" stroke="none" />
  </Icon>
);

export const ClipboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2.5" />
    <path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7M8.5 18h4" />
  </Icon>
);

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.6v.2" strokeWidth={2.4} />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5L2.8 19.5h18.4z" />
    <path d="M12 10v4.5M12 17.2v.2" strokeWidth={2.4} />
  </Icon>
);

export const GridIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4" width="6" height="6" rx="1.2" />
    <rect x="14" y="4" width="6" height="6" rx="1.2" />
    <rect x="4" y="14" width="6" height="6" rx="1.2" />
    <rect x="14" y="14" width="6" height="6" rx="1.2" />
  </Icon>
);

export const LogoMark = (p: IconProps) => (
  <svg width={p.size ?? 28} height={p.size ?? 28} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
    <rect width="64" height="64" rx="16" fill="var(--brand)" />
    <path d="M18 34l9 9 19-21" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
