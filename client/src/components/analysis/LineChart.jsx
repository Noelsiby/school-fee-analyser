/**
 * Small progress chart: the student's % in each exam (solid line), the class
 * average (dashed), and the pass mark (red dotted line). Plain SVG, no library.
 */
const W = 640, H = 230, PAD = { l: 38, r: 16, t: 16, b: 46 };

export default function LineChart({ points, passMark }) {
  if (!points.length) return null;
  const x = (i) => PAD.l + (points.length === 1 ? (W - PAD.l - PAD.r) / 2 : (i * (W - PAD.l - PAD.r)) / (points.length - 1));
  const y = (v) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b);
  const line = (key) => points
    .map((p, i) => (p[key] === null || p[key] === undefined ? null : `${x(i)},${y(p[key])}`))
    .filter(Boolean).join(' ');
  const short = (s) => (s.length > 14 ? `${s.slice(0, 13)}…` : s);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="an-chart" role="img" aria-label="Percentage in each exam">
      {[0, 25, 50, 75, 100].map((v) => (
        <g key={v}>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="an-grid" />
          <text x={PAD.l - 6} y={y(v) + 4} className="an-axis" textAnchor="end">{v}</text>
        </g>
      ))}
      {passMark > 0 && (
        <g>
          <line x1={PAD.l} x2={W - PAD.r} y1={y(passMark)} y2={y(passMark)} className="an-pass" />
          <text x={W - PAD.r} y={y(passMark) - 4} className="an-axis an-pass-label" textAnchor="end">Pass {passMark}%</text>
        </g>
      )}
      <polyline points={line('classAverage')} className="an-line-class" />
      <polyline points={line('value')} className="an-line" />
      {points.map((p, i) => (
        <g key={i}>
          {p.value !== null && p.value !== undefined && (
            <>
              <circle cx={x(i)} cy={y(p.value)} r="4.5" className="an-dot" />
              <text x={x(i)} y={y(p.value) - 9} className="an-value" textAnchor="middle">{Math.round(p.value)}%</text>
            </>
          )}
          <text x={x(i)} y={H - PAD.b + 18} className="an-axis" textAnchor="middle">{short(p.label)}</text>
        </g>
      ))}
    </svg>
  );
}
