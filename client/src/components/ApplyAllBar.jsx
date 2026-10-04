import { useState } from 'react';
import { MAIN, PARTS, applyMaxMarks } from '../utils/subjectParts';
import './ApplyAllBar.css';

/**
 * "Apply to all" for exam max marks: one box for the main mark plus one per extra
 * part used by these subjects. Only filled boxes are applied, so you can set just
 * Reading for every subject, or just the main mark.
 * `setValues` is the state setter of a { subjectId: maxMarksValue } map.
 */
export default function ApplyAllBar({ label, subjects, setValues, compact = false }) {
  const parts = PARTS.filter(p => subjects.some(s => s.components?.includes(p)));
  const [fields, setFields] = useState({});

  const apply = () => {
    setValues(prev => {
      const next = { ...prev };
      subjects.forEach(s => { next[s.id] = applyMaxMarks(s, prev[s.id], fields); });
      return next;
    });
  };

  const box = (key, text) => (
    <label key={key} className="aab-field">
      <span>{text}</span>
      <input
        type="number" min="0" step="0.1" className="form-input"
        placeholder="–"
        value={fields[key] ?? ''}
        aria-label={`${label} ${text}`}
        onChange={e => setFields(f => ({ ...f, [key]: e.target.value }))}
      />
    </label>
  );

  if (subjects.length === 0) return null;
  return (
    <div className={`aab ${compact ? 'aab-compact' : ''}`}>
      <span className="aab-label">{label}</span>
      <div className="aab-fields">
        {box(MAIN, parts.length ? 'Main' : 'Max')}
        {parts.map(p => box(p, p))}
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!Object.values(fields).some(v => v !== '' && v != null)}
          onClick={apply}
        >
          Apply to all
        </button>
      </div>
    </div>
  );
}
