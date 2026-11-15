/** FieldShift mark: a wheat sprout over field rows (from the prototype's fieldshift.svg, recoloured). */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <rect width="48" height="48" rx="14" fill="#e7f1fb" />
      <path d="M8 40h32M11 35h26" stroke="#2b7fd0" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d="M24 33V17m0 8c-9 0-12-5-12-12 8 0 12 3 12 12Zm0-5c0-8 3-13 12-13 0 8-3 13-12 13Z"
        fill="none"
        stroke="#2f6b3a"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Wheat stalks drawn as a row, used in empty states. */
export function WheatRow({ className }: { className?: string }) {
  const stalk = (x: number, h: number, lean: number) => {
    const top = 100 - h;
    const grains = Array.from({ length: 6 }, (_, i) => {
      const y = top + 6 + i * 7;
      const cx = x + lean * (1 - (y - top) / h);
      return (
        <g key={i}>
          <ellipse cx={cx - 4} cy={y} rx="3.4" ry="6" transform={`rotate(-28 ${cx - 4} ${y})`} fill="#e0b545" />
          <ellipse cx={cx + 4} cy={y + 3} rx="3.4" ry="6" transform={`rotate(28 ${cx + 4} ${y + 3})`} fill="#c9971f" />
        </g>
      );
    });
    return (
      <g key={x}>
        <path d={`M${x} 100 Q ${x + lean * 0.4} ${100 - h / 2} ${x + lean} ${top}`} stroke="#9b7a24" strokeWidth="2" fill="none" />
        {grains}
      </g>
    );
  };
  return (
    <svg viewBox="0 0 200 100" className={className} aria-hidden>
      <path d="M0 99h200" stroke="#2f6b3a" strokeWidth="2" />
      {stalk(40, 70, -6)}
      {stalk(75, 82, 3)}
      {stalk(110, 74, -2)}
      {stalk(145, 86, 6)}
      {stalk(172, 64, -4)}
    </svg>
  );
}
