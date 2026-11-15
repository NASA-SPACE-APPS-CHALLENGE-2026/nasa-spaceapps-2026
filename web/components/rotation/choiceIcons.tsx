/** Small line icons for the Rotation Explorer's answer tiles, keyed by question and option value. */

const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const ICONS: Record<string, React.ReactNode> = {
  // How the field is prepared
  'tillage:no-till': (
    <>
      <path {...P} d="M3 17h18" />
      <path {...P} d="M6 17v-4M9 17v-3M12 17v-4M15 17v-3M18 17v-4" />
    </>
  ),
  'tillage:reduced': (
    <>
      <path {...P} d="M3 17h18" />
      <path {...P} d="M5 17v-3M8 17v-3M16 17v-3M19 17v-3" />
      <path {...P} d="M10.5 14.5h3" />
    </>
  ),
  'tillage:conventional': <path {...P} d="M3 17c2-2 3-2 4.5 0s2.5 2 4.5 0 3-2 4.5 0 2.5 2 4.5 0M3 12c2-2 3-2 4.5 0s2.5 2 4.5 0 3-2 4.5 0 2.5 2 4.5 0" />,
  // Irrigation
  'irrigation:none': (
    <>
      <path {...P} d="M7 15a4 4 0 0 1 .5-8 5 5 0 0 1 9.6 1.4A3.3 3.3 0 0 1 17 15Z" />
      <path {...P} d="M9 18v2M12 18v3M15 18v2" />
    </>
  ),
  'irrigation:supplemental': <path {...P} d="M12 4c3 4 5 6.5 5 9a5 5 0 0 1-10 0c0-2.5 2-5 5-9Z" />,
  'irrigation:full': (
    <>
      <path {...P} d="M7 6c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6ZM17 6c2 3 3 4.5 3 6a3 3 0 0 1-6 0c0-1.5 1-3 3-6Z" />
      <path {...P} d="M4 20h16" />
    </>
  ),
  // Cover crop experience
  'cover:never': (
    <>
      <path {...P} d="M3 17h18" />
      <path {...P} d="M7 20h2M13 20h2" />
    </>
  ),
  'cover:sometimes': (
    <>
      <path {...P} d="M3 17h18M12 17v-5m0 2c-2.5 0-3.5-1.5-3.5-3.5 2.5 0 3.5 1 3.5 3.5Z" />
    </>
  ),
  'cover:every-year': (
    <>
      <path {...P} d="M3 17h18" />
      {[6, 12, 18].map((x) => (
        <path key={x} {...P} d={`M${x} 17v-4m0 1.5c-2 0-2.8-1.2-2.8-2.8 2 0 2.8.8 2.8 2.8Z`} />
      ))}
    </>
  ),
  // Field problems
  'problems:rootworm': <path {...P} d="M4 15c1.5-3 3.5-3 5 0s3.5 3 5 0 3.5-3 5 0M18.5 13.5l1.5-1" />,
  'problems:scn': (
    <>
      <circle {...P} cx="12" cy="12" r="6.5" />
      <circle cx="10" cy="11" r="1.2" fill="currentColor" />
      <circle cx="14" cy="12.5" r="1.2" fill="currentColor" />
      <circle cx="11.5" cy="14.5" r="1.2" fill="currentColor" />
    </>
  ),
  'problems:white-mold': <path {...P} d="M12 5v2M12 17v2M5 12h2M17 12h2M7 7l1.4 1.4M15.6 15.6 17 17M7 17l1.4-1.4M15.6 8.4 17 7M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />,
  'problems:resistant-weeds': <path {...P} d="M12 20V9m0 4c-3 0-5-2-5-5 3 0 5 2 5 5Zm0-3c0-3 2-5 5-5 0 3-2 5-5 5ZM8 20h8" />,
  'problems:erosion': <path {...P} d="M3 8l18 6M3 13l7 2.5M14 17l7 2M10 15.5c1 1.5 2.5 2 4 1.5" />,
  'problems:wet-spots': (
    <>
      <path {...P} d="M4 16c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Z" />
      <path {...P} d="M12 4c1.6 2.2 2.5 3.5 2.5 4.8a2.5 2.5 0 0 1-5 0C9.5 7.5 10.4 6.2 12 4Z" />
    </>
  ),
};

const GENERIC: Record<string, React.ReactNode> = {
  yes: <path {...P} d="m5 12.5 4.5 4.5L19 7.5" />,
  no: <path {...P} d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
  unsure: (
    <>
      <path {...P} d="M9.2 9a2.9 2.9 0 1 1 4.3 2.5c-1 .6-1.5 1.2-1.5 2.3" />
      <circle cx="12" cy="17.3" r="1.1" fill="currentColor" />
    </>
  ),
  none: <path {...P} d="M5 12h14" />,
};

export function ChoiceIcon({ group, value }: { group: string; value: string }) {
  const icon = ICONS[`${group}:${value}`] ?? GENERIC[value];
  if (!icon) return null;
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
      {icon}
    </svg>
  );
}
