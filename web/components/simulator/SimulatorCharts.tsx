import { MONTH_SHORT } from '@/lib/domain/management';
import { coverage, type BarScore, type StrategyScore } from '@/lib/domain/rotation/score';
import type { Strategy } from '@/lib/domain/rotation/strategies';
import type { ScenarioWeatherSummary } from '@/lib/domain/scenario';

const PANEL = 'rounded-[var(--radius-panel)] border border-line bg-panel p-4 lg:p-5';

function yFor(value: number, min: number, max: number, top: number, height: number) {
  return top + height - ((value - min) / (max - min || 1)) * height;
}

export function RainfallChart({ summary }: { summary: ScenarioWeatherSummary }) {
  const width = 760;
  const height = 270;
  const left = 48;
  const right = 18;
  const top = 18;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maxRain = Math.max(1, ...summary.months.flatMap((m) => [m.baselineRainIn, m.adjustedRainIn]));
  const max = Math.ceil(maxRain / 2) * 2 || 2;
  const band = plotWidth / 12;

  return (
    <figure className={PANEL}>
      <figcaption className="font-plate text-xl">Monthly rainfall</figcaption>
      <p className="mt-1 text-[14px] text-ink-soft">NASA POWER 1991–2020 monthly normals compared with your hypothetical adjustment.</p>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly rainfall baseline and scenario comparison, in inches" className="min-w-[620px] w-full">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const value = max * fraction;
            const y = top + plotHeight * (1 - fraction);
            return (
              <g key={fraction}>
                <line x1={left} x2={width - right} y1={y} y2={y} stroke="#d6e1d9" strokeDasharray={fraction === 0 ? undefined : '3 5'} />
                <text x={left - 8} y={y + 4} textAnchor="end" fill="#75847a" fontSize="11">{value.toFixed(0)}</text>
              </g>
            );
          })}
          {summary.months.map((month, index) => {
            const center = left + band * (index + 0.5);
            const barWidth = Math.min(13, band * 0.24);
            const baseY = yFor(month.baselineRainIn, 0, max, top, plotHeight);
            const scenarioY = yFor(month.adjustedRainIn, 0, max, top, plotHeight);
            return (
              <g key={month.name}>
                <rect x={center - barWidth - 2} y={baseY} width={barWidth} height={top + plotHeight - baseY} rx="2" fill="#94a69a">
                  <title>{`${month.name}: baseline ${month.baselineRainIn.toFixed(2)} inches`}</title>
                </rect>
                <rect x={center + 2} y={scenarioY} width={barWidth} height={top + plotHeight - scenarioY} rx="2" fill="#2f6b3a">
                  <title>{`${month.name}: scenario ${month.adjustedRainIn.toFixed(2)} inches`}</title>
                </rect>
                <text x={center} y={height - 13} textAnchor="middle" fill="#4a5a50" fontSize="11">{MONTH_SHORT[index]}</text>
              </g>
            );
          })}
          <text x="12" y="12" fill="#75847a" fontSize="10">in</text>
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[13px] text-ink-soft" aria-label="Chart legend">
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-[#94a69a]" aria-hidden />Historical normal</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-field" aria-hidden />Hypothetical scenario</span>
      </div>
    </figure>
  );
}

export function TemperatureChart({ summary }: { summary: ScenarioWeatherSummary }) {
  const width = 760;
  const height = 270;
  const left = 48;
  const right = 18;
  const top = 20;
  const bottom = 38;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const all = summary.months.flatMap((m) => [m.baselineTempF, m.adjustedTempF]);
  const min = Math.floor(Math.min(...all) / 10) * 10;
  const max = Math.ceil(Math.max(...all) / 10) * 10 || min + 10;
  const x = (index: number) => left + (plotWidth * index) / 11;
  const y = (value: number) => yFor(value, min, max, top, plotHeight);
  const basePoints = summary.months.map((m, i) => `${x(i)},${y(m.baselineTempF)}`).join(' ');
  const scenarioPoints = summary.months.map((m, i) => `${x(i)},${y(m.adjustedTempF)}`).join(' ');

  return (
    <figure className={PANEL}>
      <figcaption className="font-plate text-xl">Monthly average temperature</figcaption>
      <p className="mt-1 text-[14px] text-ink-soft">Air-temperature normals in °F, shifted by the scenario’s °C adjustment.</p>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly mean air temperature baseline and scenario comparison, in degrees Fahrenheit" className="min-w-[620px] w-full">
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => {
            const value = min + (max - min) * fraction;
            const yPos = top + plotHeight * (1 - fraction);
            return (
              <g key={fraction}>
                <line x1={left} x2={width - right} y1={yPos} y2={yPos} stroke="#d6e1d9" strokeDasharray={fraction === 0 ? undefined : '3 5'} />
                <text x={left - 8} y={yPos + 4} textAnchor="end" fill="#75847a" fontSize="11">{value.toFixed(0)}°</text>
              </g>
            );
          })}
          <polyline points={basePoints} fill="none" stroke="#718178" strokeWidth="3" strokeLinejoin="round" />
          <polyline points={scenarioPoints} fill="none" stroke="#2b7fd0" strokeWidth="3" strokeLinejoin="round" />
          {summary.months.map((month, index) => (
            <g key={month.name}>
              <circle cx={x(index)} cy={y(month.baselineTempF)} r="4" fill="#718178">
                <title>{`${month.name}: baseline ${month.baselineTempF.toFixed(1)} °F; scenario ${month.adjustedTempF.toFixed(1)} °F`}</title>
              </circle>
              <circle cx={x(index)} cy={y(month.adjustedTempF)} r="4" fill="#2b7fd0">
                <title>{`${month.name}: scenario ${month.adjustedTempF.toFixed(1)} °F`}</title>
              </circle>
              <text x={x(index)} y={height - 13} textAnchor="middle" fill="#4a5a50" fontSize="11">{MONTH_SHORT[index]}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-[13px] text-ink-soft" aria-label="Chart legend">
        <span className="inline-flex items-center gap-2"><i className="h-1 w-3 rounded bg-[#718178]" aria-hidden />Historical normal</span>
        <span className="inline-flex items-center gap-2"><i className="h-1 w-3 rounded bg-sky" aria-hidden />Hypothetical scenario</span>
      </div>
    </figure>
  );
}

const BAR_ORDER: Array<BarScore['id']> = ['climate', 'soilCover', 'diversity', 'pests'];

export function RotationComparisonChart({ current, proposed }: { current: StrategyScore; proposed: StrategyScore }) {
  const rows = BAR_ORDER.map((id) => ({
    id,
    current: current.bars.find((bar) => bar.id === id)!,
    proposed: proposed.bars.find((bar) => bar.id === id)!,
  }));
  return (
    <section className={PANEL} aria-labelledby="rotation-comparison-chart-title">
      <h2 id="rotation-comparison-chart-title" className="font-plate text-xl">Rotation strategy comparison</h2>
      <p className="mt-1 text-[14px] text-ink-soft">Same provisional Rotation Explorer rubric, field, and scenario for both strategies.</p>
      <div className="mt-4 space-y-4">
        {rows.map(({ id, current: a, proposed: b }) => (
          <details key={id} className="rounded-[var(--radius-control)] border border-line p-3">
            <summary className="min-h-8 cursor-pointer font-semibold">{a.label}</summary>
            <div className="mt-3 space-y-3">
              <ScoreLine label={current.strategy.title} score={a.score} tone="bg-[#94a69a]" />
              <ScoreLine label={proposed.strategy.title} score={b.score} tone="bg-field" />
              <p className="text-[13.5px] text-ink-soft">Confidence: current {a.confidence}; proposed {b.confidence}. These are rubric scores, not measured outcomes.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <ReasonBlock label="Current rotation" reasons={a.reasons.map((reason) => reason.text)} missing={a.missing} />
                <ReasonBlock label="Proposed plan" reasons={b.reasons.map((reason) => reason.text)} missing={b.missing} />
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function ScoreLine({ label, score, tone }: { label: string; score: number | null; tone: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between gap-3 text-[13px]">
        <span className="truncate">{label}</span>
        <strong>{score === null ? 'Not enough info' : `${score} / 100`}</strong>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-paper" role="img" aria-label={`${label}: ${score === null ? 'not enough information' : `${score} out of 100`}`}>
        {score !== null && <div className={`h-full rounded-full ${tone}`} style={{ width: `${score}%` }} />}
      </div>
    </div>
  );
}

function ReasonBlock({ label, reasons, missing }: { label: string; reasons: string[]; missing: string[] }) {
  return (
    <div>
      <p className="text-[13px] font-semibold">{label}</p>
      <ul className="mt-1 list-disc space-y-1 pl-4 text-[13px] text-ink-soft">
        {reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}
      </ul>
      {missing.length > 0 && <p className="mt-1 text-[12.5px] text-wheat-deep">Missing: {missing.join(', ')}.</p>}
    </div>
  );
}

export function CropCoverTimeline({ current, proposed, firstYear }: { current: Strategy; proposed: Strategy; firstYear: number }) {
  const currentCoverage = coverage(current.seasons);
  const proposedCoverage = coverage(proposed.seasons);
  const years = [firstYear, firstYear + 1, firstYear + 2];
  const rows = [
    { label: 'Current', title: current.title, cover: currentCoverage },
    { label: 'Proposed', title: proposed.title, cover: proposedCoverage },
  ];
  const stateAt = (cover: ReturnType<typeof coverage>, year: number, month: number): 'living' | 'residue' | 'bare' => {
    const index = year * 12 + month;
    return cover.living.has(index) ? 'living' : cover.residue.has(index) ? 'residue' : 'bare';
  };
  const colors = { living: 'bg-field', residue: 'bg-wheat', bare: 'bg-[#eef2ef]' };
  const totals = rows.map(({ cover }) => {
    let living = 0;
    let residue = 0;
    for (const year of years) {
      for (let month = 0; month < 12; month++) {
        const state = stateAt(cover, year, month);
        if (state === 'living') living++;
        if (state === 'residue') residue++;
      }
    }
    return { living, residue };
  });

  return (
    <section className={PANEL} aria-labelledby="cover-timeline-title">
      <h2 id="cover-timeline-title" className="font-plate text-xl">Seasonal crop-cover timeline</h2>
      <p className="mt-1 text-[14px] text-ink-soft">Planner dates and the existing crop-calendar estimates; blank months are schedule-derived, not satellite-confirmed bare soil.</p>
      <div className="mt-4 space-y-5 overflow-x-auto">
        {rows.map((row, strategyIndex) => (
          <div key={row.label} className="min-w-[680px]">
            <h3 className="mb-2 text-[14px] font-semibold">{row.label}: {row.title}</h3>
            <div className="space-y-2">
              {years.map((year) => (
                <div key={year} className="grid grid-cols-[52px_repeat(12,minmax(0,1fr))] gap-1">
                  <span className="self-center text-[12px] font-semibold text-ink-soft">{year}</span>
                  {MONTH_SHORT.map((month, index) => {
                    const state = stateAt(row.cover, year, index);
                    return (
                      <div key={month} className="text-center">
                        <div className={`h-5 rounded-sm border border-white ${colors[state]}`} title={`${month} ${year}: ${state === 'living' ? 'scheduled crop or cover growth' : state === 'residue' ? 'scheduled winter-killed cover residue' : 'no scheduled living crop or cover'}`} />
                        {year === years[0] && <span className="text-[10px] text-ink-faint">{month}</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="mt-2 text-[13px] text-ink-soft">{totals[strategyIndex].living} of 36 months with scheduled living crops or covers; {totals[strategyIndex].residue} additional months with modeled cover residue.</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-[13px] text-ink-soft">
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-field" aria-hidden />Living crop or cover</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm bg-wheat" aria-hidden />Winter-killed cover residue</span>
        <span className="inline-flex items-center gap-2"><i className="h-3 w-3 rounded-sm border border-line bg-[#eef2ef]" aria-hidden />No scheduled living cover</span>
      </div>
      <p className="mt-3 text-[13px] text-ink-soft">This timeline uses the saved crop and task months. When Planner dates are missing, typical central-US crop-calendar months fill the display and are called out as estimates.</p>
    </section>
  );
}
