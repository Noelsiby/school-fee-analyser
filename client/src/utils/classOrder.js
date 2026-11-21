/**
 * School order for class names: Nursery, LKG, UKG, then Class 1, 2 … 10 (sections 1A, 1B together),
 * then anything else alphabetically. "Class 2" comes before "Class 10".
 * Mirrors server/lib/classOrder.js.
 */
const PRE = [/^(pre[-\s]?kg|nursery|play)/i, /^l\.?\s*k\.?\s*g/i, /^u\.?\s*k\.?\s*g/i];

function rankOf(name) {
  const n = String(name || '').trim();
  const pre = PRE.findIndex((re) => re.test(n));
  if (pre !== -1) return [0, pre, n];
  const m = n.match(/(\d+)/);
  if (m) return [1, Number(m[1]), n.slice(m.index + m[1].length).trim().toUpperCase()];
  return [2, 0, n.toUpperCase()];
}

export const byClassName = (a, b) => {
  const x = rankOf(a.name ?? a), y = rankOf(b.name ?? b);
  return x[0] - y[0] || x[1] - y[1] || String(x[2]).localeCompare(String(y[2]), undefined, { numeric: true });
};

