import { PARTS } from '../utils/subjectParts';
import './SubjectFields.css';

// Form pieces shared by the Subjects page and the Subjects tab of a class.

// ─────────────────────────────────────────────
// Class picker: tick one or many classes, with "Select all"
// ─────────────────────────────────────────────
export const byClassName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }); // Class 2 before Class 10

export function ClassPicker({ classes: unsorted, selected, onChange, lockedId }) {
  const classes = [...unsorted].sort(byClassName);
  const allIds = classes.map(c => c.id);
  const allTicked = allIds.length > 0 && allIds.every(id => selected.includes(id));

  const toggle = (id) => {
    if (id === lockedId) return;
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };
  const toggleAll = () => onChange(allTicked ? (lockedId ? [lockedId] : []) : allIds);

  return (
    <div className="class-picker">
      <label className="class-picker-all">
        <input type="checkbox" checked={allTicked} onChange={toggleAll} />
        <span>Select all classes</span>
        <span className="class-picker-count">{selected.length} selected</span>
      </label>
      <div className="class-picker-grid">
        {classes.map(c => (
          <label key={c.id} className={`class-picker-item ${selected.includes(c.id) ? 'checked' : ''} ${c.id === lockedId ? 'locked' : ''}`}>
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              disabled={c.id === lockedId}
              onChange={() => toggle(c.id)}
            />
            <span>{c.name}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Extra parts: Reading / Writing / Dictation tick-boxes
// ─────────────────────────────────────────────
export function PartsPicker({ subjectName, value, onChange }) {
  return (
    <div className="parts-box">
      <p className="parts-box-title">Extra parts <span>(optional)</span></p>
      <p className="parts-box-hint">
        Marked on top of the main {subjectName?.trim() || 'subject'} mark and added into its total,
        e.g. English 40 + Reading 5 + Writing 4 = 49.
      </p>
      <div className="parts-box-options">
        {PARTS.map(p => (
          <label key={p} className="parts-toggle">
            <input
              type="checkbox"
              checked={value.includes(p)}
              onChange={e => onChange(e.target.checked ? PARTS.filter(x => x === p || value.includes(x)) : value.filter(x => x !== p))}
            />
            <strong>{p}</strong>
          </label>
        ))}
      </div>
    </div>
  );
}
