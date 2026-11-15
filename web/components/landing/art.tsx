import Image from 'next/image';
import type { ArtKind } from '@/content/site';

/**
 * Drawn stand-ins for aerial field photography (row patterns, center pivots, tractor ruts, drainage lines,
 * contour strips). Every card shows one of these until a real photo path is set in content/site.ts.
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 400;
const H = 500;

function Rows() {
  const lines = [];
  for (let i = -40; i < 70; i++) {
    const x = i * 9;
    lines.push(<path key={i} d={`M${x} 0 L${x + 260} ${H}`} stroke={i % 2 ? '#56782a' : '#4b6a24'} strokeWidth="4.2" />);
  }
  return (
    <>
      <rect width={W} height={H} fill="#4a3826" />
      <g>{lines}</g>
      {/* Headland where the planter turned */}
      <path d={`M0 ${H - 70} L${W} ${H - 120} L${W} ${H} L0 ${H}Z`} fill="#5a4530" />
      {Array.from({ length: 6 }, (_, i) => (
        <path key={i} d={`M0 ${H - 60 + i * 11} L${W} ${H - 110 + i * 11}`} stroke="#4a3826" strokeWidth="3" />
      ))}
      <path d={`M0 ${H - 70} L${W} ${H - 120}`} stroke="#c9b58a" strokeWidth="5" />
    </>
  );
}

function Pivots() {
  const r = rng(4);
  const fills = ['#5d8a2a', '#b89a4f', '#6f9a33', '#8c7a55'];
  const cells = [
    [0, 0],
    [200, 0],
    [0, 250],
    [200, 250],
  ];
  return (
    <>
      <rect width={W} height={H} fill="#9c8a62" />
      {cells.map(([x, y], i) => {
        const cx = x + 100;
        const cy = y + 125;
        const rad = 92;
        const half = r() < 0.5;
        return (
          <g key={i}>
            <rect x={x + 3} y={y + 3} width="194" height="244" fill={i % 2 ? '#8f7d55' : '#a28f66'} />
            <circle cx={cx} cy={cy} r={rad} fill={fills[i]} />
            {half && <path d={`M${cx} ${cy} L${cx + rad} ${cy} A${rad} ${rad} 0 0 1 ${cx - rad} ${cy} Z`} fill={fills[(i + 1) % 4]} />}
            {[0.25, 0.42, 0.59, 0.76, 0.93].map((k) => (
              <circle key={k} cx={cx} cy={cy} r={rad * k} fill="none" stroke="rgba(30,24,14,0.32)" strokeWidth="1.4" />
            ))}
            <circle cx={cx} cy={cy} r="3.5" fill="#e4dccb" />
            <path d={`M${cx} ${cy} L${cx + Math.cos(r() * 6.28) * rad} ${cy + Math.sin(r() * 6.28) * rad}`} stroke="#e4dccb" strokeWidth="2" />
          </g>
        );
      })}
      <path d={`M200 0V${H}M0 250H${W}`} stroke="#cbbd9c" strokeWidth="5" />
    </>
  );
}

function Ruts() {
  const stubble = [];
  for (let i = 0; i < 70; i++) stubble.push(<path key={i} d={`M${i * 7 - 60} 0 L${i * 7 + 40} ${H}`} stroke="#b49b62" strokeWidth="2" />);
  return (
    <>
      <rect width={W} height={H} fill="#c5ad74" />
      <g opacity="0.7">{stubble}</g>
      {[0, 1].map((k) => (
        <g key={k} fill="none" stroke="#6e5a35" strokeLinecap="round">
          <path d={`M${-20 + k * 120} ${H + 10} C ${120 + k * 90} ${360 - k * 40}, ${40 + k * 60} ${160}, ${260 + k * 60} -20`} strokeWidth="9" />
          <path d={`M${10 + k * 120} ${H + 10} C ${150 + k * 90} ${360 - k * 40}, ${70 + k * 60} ${160}, ${290 + k * 60} -20`} strokeWidth="9" />
        </g>
      ))}
      <g fill="#e6dbc0" opacity="0.8">
        <rect x="300" y="380" width="70" height="24" rx="4" transform="rotate(-24 335 392)" />
        <rect x="60" y="70" width="58" height="20" rx="4" transform="rotate(30 89 80)" />
      </g>
    </>
  );
}

function Drainage() {
  const branches = [];
  for (let i = 0; i < 9; i++) {
    const y = 40 + i * 52;
    branches.push(<path key={`l${i}`} d={`M200 ${y} L60 ${y - 60}`} />, <path key={`r${i}`} d={`M200 ${y} L340 ${y - 60}`} />);
  }
  return (
    <>
      <rect width={W} height={H} fill="#55762c" />
      {Array.from({ length: 50 }, (_, i) => (
        <path key={i} d={`M0 ${i * 10} H${W}`} stroke="#4c6a26" strokeWidth="4" />
      ))}
      <ellipse cx="290" cy="330" rx="90" ry="60" fill="#3d5527" opacity="0.6" />
      <g stroke="#30431d" strokeWidth="3.5" fill="none">{branches}</g>
      <path d={`M200 0 V${H}`} stroke="#2a3a1a" strokeWidth="6" />
      <path d={`M0 ${H - 40} C 120 ${H - 70}, 260 ${H - 10}, ${W} ${H - 50}`} stroke="#3b4a44" strokeWidth="14" fill="none" />
    </>
  );
}

function Strips() {
  const bands = [];
  for (let i = 0; i < 10; i++) {
    const y = i * 56 - 40;
    bands.push(
      <path
        key={i}
        d={`M-20 ${y} C 120 ${y - 50}, 260 ${y + 60}, 420 ${y} L420 ${y + 56} C 260 ${y + 116}, 120 ${y + 6}, -20 ${y + 56} Z`}
        fill={i % 2 ? '#c4a557' : '#5f8a2c'}
      />,
    );
  }
  return (
    <>
      <rect width={W} height={H} fill="#5f8a2c" />
      {bands}
      {Array.from({ length: 10 }, (_, i) => {
        const y = i * 56 - 40;
        return <path key={i} d={`M-20 ${y} C 120 ${y - 50}, 260 ${y + 60}, 420 ${y}`} stroke="rgba(40,30,15,0.35)" strokeWidth="2" fill="none" />;
      })}
    </>
  );
}

const KINDS: Record<ArtKind, () => React.JSX.Element> = { rows: Rows, pivots: Pivots, ruts: Ruts, drainage: Drainage, strips: Strips };

export function AerialArt({ kind, className = '' }: { kind: ArtKind; className?: string }) {
  const Kind = KINDS[kind];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <Kind />
      {/* Light falloff, as if photographed from a plane */}
      <defs>
        <radialGradient id={`v-${kind}`} cx="0.5" cy="0.45" r="0.75">
          <stop offset="0.55" stopColor="#000" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#v-${kind})`} />
    </svg>
  );
}

/** A real photo when one is set, otherwise the drawn stand-in. Fills its (relatively positioned) parent. */
export function Media({ image, art, alt, sizes, className = '' }: { image: string | null; art: ArtKind; alt: string; sizes: string; className?: string }) {
  if (image) return <Image src={image} alt={alt} fill sizes={sizes} className={`object-cover ${className}`} />;
  return (
    <div role="img" aria-label={alt} className={`absolute inset-0 ${className}`}>
      <AerialArt kind={art} className="h-full w-full" />
    </div>
  );
}

/** Field sensor on a post: solar panel, logger box, antenna, and a probe going into the soil. */
export function SensorArt({ className = '', label }: { className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 240 420" className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {/* ground */}
      <path d="M0 360 C 60 352, 180 366, 240 356 V420 H0Z" fill="#3b2a1c" />
      <path d="M0 360 C 60 352, 180 366, 240 356" stroke="#5a4330" strokeWidth="3" fill="none" />
      {/* crop leaves at the edge */}
      <g stroke="#6f9a33" strokeWidth="5" strokeLinecap="round" fill="none">
        <path d="M24 360 C 20 330, 8 316, -4 310" />
        <path d="M30 360 C 34 324, 52 306, 64 300" />
        <path d="M206 358 C 202 330, 188 312, 176 304" />
        <path d="M214 358 C 222 326, 236 314, 248 310" />
      </g>
      {/* probe below ground */}
      <path d="M118 362 V408" stroke="#bdb5a6" strokeWidth="4" strokeDasharray="6 4" />
      <circle cx="118" cy="388" r="5" fill="#d9b65a" />
      {/* post */}
      <rect x="112" y="96" width="12" height="268" rx="2" fill="#8a8578" />
      <rect x="112" y="96" width="4" height="268" fill="#a6a194" />
      {/* antenna */}
      <path d="M118 96 V28" stroke="#bdb5a6" strokeWidth="3" />
      <circle cx="118" cy="24" r="5" fill="#d9b65a" />
      {/* solar panel */}
      <g transform="rotate(-18 150 92)">
        <rect x="124" y="74" width="74" height="40" rx="3" fill="#24324a" stroke="#c8c2b4" strokeWidth="3" />
        <path d="M148 74 V114 M173 74 V114 M124 94 H198" stroke="#3b4d6b" strokeWidth="2" />
      </g>
      {/* logger box */}
      <rect x="84" y="170" width="68" height="84" rx="8" fill="#e8e4d9" />
      <rect x="84" y="170" width="68" height="14" rx="6" fill="#d4cfc2" />
      <circle cx="100" cy="206" r="4" fill="#8fbf4a" />
      <rect x="94" y="222" width="48" height="5" rx="2" fill="#bdb5a6" />
      <rect x="94" y="232" width="34" height="5" rx="2" fill="#bdb5a6" />
      {/* rain gauge */}
      <path d="M58 140 H92 L86 176 H64Z" fill="#c8c2b4" />
      <path d="M92 156 H112" stroke="#8a8578" strokeWidth="4" />
      {/* temperature shield */}
      <g transform="translate(136 280)">
        {[0, 9, 18, 27].map((y) => (
          <rect key={y} x={0} y={y} width={38 - y / 3} height="6" rx="3" fill="#e8e4d9" />
        ))}
        <path d="M-12 14 H0" stroke="#8a8578" strokeWidth="4" />
      </g>
    </svg>
  );
}
