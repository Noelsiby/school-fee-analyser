import { MAIN, hasParts, totalOf } from '../utils/subjectParts';
import './MaxMarksField.css';

/**
 * Max-marks input for one subject in an exam.
 * Ordinary subjects: a single number. Subjects with parts: the main mark plus one
 * input per part (blank = that part isn't in this exam) and the computed total.
 * `value` is a number or { Main, Reading, ... }; `subject` needs { name, components }.
 * `requireParts` makes every part mandatory (teachers can't drop parts from an exam).
 */
export default function MaxMarksField({ subject, value, onChange, disabled = false, requireParts = false }) {
  if (!hasParts(subject)) {
    return (
      <div className="mmf">
        <span className="mmf-label">Max Marks:</span>
        <input
          type="number" step="0.1" min="1" max="999" required
          className="form-input mmf-input"
          value={value ?? ''}
          disabled={disabled}
          aria-label={`${subject.name} max marks`}
          onChange={e => onChange(e.target.value)}
        />
      </div>
    );
  }

  const parts = value && typeof value === 'object' ? value : { [MAIN]: value ?? '' };
  const field = (key, label, required) => (
    <label key={key} className={`mmf-part ${key === MAIN ? 'mmf-main' : ''}`}>
      <span>{label}</span>
      <input
        type="number" step="0.1" min={required ? 1 : 0} max="999" required={required}
        className="form-input mmf-input"
        value={parts[key] ?? ''}
        placeholder={required ? '' : '–'}
        title={required ? '' : 'Leave blank if this part is not in this exam'}
        disabled={disabled}
        aria-label={`${subject.name} ${key === MAIN ? 'main' : key} max marks`}
        onChange={e => onChange({ ...parts, [key]: e.target.value })}
      />
    </label>
  );

  return (
    <div className="mmf mmf-parts">
      {field(MAIN, 'Main', true)}
      {subject.components.map(p => (
        <span key={p} className="mmf-plus-wrap">
          <span className="mmf-plus" aria-hidden="true">+</span>
          {field(p, p, requireParts)}
        </span>
      ))}
      <span className="mmf-total" aria-label={`${subject.name} total max marks`}>= {totalOf(parts)}</span>
    </div>
  );
}
