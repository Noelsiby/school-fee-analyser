import { useState } from 'react';
import { PAPER_OPTIONS } from './downloadReport';

const KEY = 'reportPaper';
const read = () => { try { return localStorage.getItem(KEY) || 'A4'; } catch { return 'A4'; } };

/** The paper size for report PDFs, remembered on this computer. */
export function usePaper() {
  const [paper, setPaper] = useState(read);
  const choose = (p) => {
    setPaper(p);
    try { localStorage.setItem(KEY, p); } catch { /* private window: just don't remember */ }
  };
  return [paper, choose];
}

export function PaperPicker({ paper, onChange }) {
  return (
    <label className="paper-picker">
      <span>Paper</span>
      <select className="form-select" value={paper} onChange={e => onChange(e.target.value)} aria-label="Paper size">
        {PAPER_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
