import { useState } from 'react';
import { MAIN, partKeys } from '../utils/subjectParts';

/**
 * Inline editor a Class Teacher uses to correct one student's mark.
 * Ordinary subjects: one input. Subjects with parts: main mark + one input per part.
 * Calls onSave with the request body for PUT /api/class-teacher/marks/edit
 * (minus markId): { newMarks } or { componentMarks }.
 * Enter saves, Escape cancels.
 */
export default function MarkEditor({ markRecord, maxMarks, componentMaxMarks, onSave, onCancel, saving, color = '#2563eb' }) {
  const [single, setSingle] = useState(markRecord.marksObtained ?? '');
  const keys = partKeys(componentMaxMarks); // e.g. ['Main', 'Reading', 'Writing']
  const [parts, setParts] = useState(() =>
    Object.fromEntries(keys.map(k => [k, markRecord.componentMarks?.[k] ?? '']))
  );

  const save = () => {
    if (saving) return;
    if (componentMaxMarks) {
      const bad = keys.find(k => {
        const v = Number(parts[k]);
        return parts[k] === '' || isNaN(v) || v < 0 || v > componentMaxMarks[k];
      });
      if (bad) { alert(`${bad === MAIN ? 'Main mark' : bad} must be between 0 and ${componentMaxMarks[bad]}`); return; }
      onSave({ componentMarks: Object.fromEntries(keys.map(k => [k, Number(parts[k])])) });
    } else {
      const v = Number(single);
      if (single === '' || isNaN(v) || v < 0 || v > maxMarks) { alert(`Marks must be between 0 and ${maxMarks}`); return; }
      onSave({ newMarks: v });
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') onCancel();
  };

  const inputStyle = { width: 52, padding: 4, textAlign: 'center', border: `2px solid ${color}`, borderRadius: 4 };

  return (
    <div style={{ display: 'flex', gap: 4, justifyContent: 'center', alignItems: 'flex-end' }} onClick={e => e.stopPropagation()}>
      {componentMaxMarks ? keys.map((k, i) => (
        <label key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '0.62rem', color: '#64748b', fontWeight: 600 }}>
          {k === MAIN ? 'Main' : k.charAt(0)} /{componentMaxMarks[k]}
          <input
            type="number" autoFocus={i === 0} style={inputStyle} disabled={saving}
            value={parts[k]} aria-label={k}
            onChange={e => setParts(prev => ({ ...prev, [k]: e.target.value }))}
            onKeyDown={onKeyDown}
          />
        </label>
      )) : (
        <input
          type="number" autoFocus style={{ ...inputStyle, width: 60 }} disabled={saving}
          value={single}
          onChange={e => setSingle(e.target.value)}
          onKeyDown={onKeyDown}
        />
      )}
      <button
        onClick={save} disabled={saving} aria-label="Save mark"
        style={{ background: color, color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', padding: '5px 8px' }}
      >
        ✓
      </button>
    </div>
  );
}
