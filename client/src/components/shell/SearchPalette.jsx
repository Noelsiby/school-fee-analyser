/**
 * Search from anywhere (top bar, or Ctrl+K / "/"): students, classes, teachers, exams and pages.
 * Results depend on the role in use (see server/routes/search.js). ↑ ↓ to move, Enter to open, Esc to close.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import './Shell.css';

const EMPTY = { students: [], classes: [], teachers: [], exams: [], marks: [] };

/** Where each result opens, for each role. */
function linksFor(role, data, pages, q) {
  const out = [];
  const ql = q.trim().toLowerCase();
  if (ql) {
    pages.filter((p) => p.label.toLowerCase().includes(ql)).slice(0, 4)
      .forEach((p) => out.push({ group: 'Pages', icon: p.icon, title: p.label, sub: 'Open page', to: p.path }));
  }
  const base = role === 'Admin' ? '/admin' : '/class-teacher';
  data.students.forEach((s) => out.push({ group: 'Students', icon: '👦', title: s.name, sub: `${s.class?.name} · Roll ${s.rollNumber}`, to: `${base}/students/${s.id}` }));
  if (role === 'Admin') {
    data.classes.forEach((c) => out.push({ group: 'Classes', icon: '🏛️', title: c.name, sub: `${c._count?.students ?? 0} students`, to: `/admin/classes/${c.id}` }));
    data.teachers.forEach((t) => out.push({ group: 'Teachers', icon: '👩‍🏫', title: t.name, sub: t.email, to: `/admin/teachers?q=${encodeURIComponent(t.name)}` }));
    data.exams.forEach((e) => out.push({ group: 'Exams', icon: '📝', title: e.name, sub: e.status === 'Draft' ? 'Draft' : 'Open results', to: e.status === 'Draft' ? '/admin/exams' : `/admin/exams/${e.id}/results` }));
  } else if (role === 'ClassTeacher') {
    data.classes.forEach((c) => out.push({ group: 'Classes', icon: '🏛️', title: c.name, sub: `${c._count?.students ?? 0} students`, to: '/class-teacher/dashboard' }));
    data.exams.forEach((e) => out.push({ group: 'Exams', icon: '📝', title: e.name, sub: 'Review marks', to: `/class-teacher/exams/${e.id}/review?classId=${e.classId}` }));
  } else {
    (data.marks || []).forEach((m) => out.push({ group: 'Enter marks', icon: '✍️', title: `${m.subjectName} · ${m.className}`, sub: m.examName, to: `/subject-teacher/exams/${m.examId}/subjects/${m.subjectId}/marks` }));
  }
  return out;
}

export default function SearchPalette({ open, onClose, role, pages }) {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [data, setData] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { if (open) { setQ(''); setData(EMPTY); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

  // Ask the server a moment after typing stops
  useEffect(() => {
    if (!open) return undefined;
    if (q.trim().length < 2) { setData(EMPTY); return undefined; }
    setBusy(true);
    const t = setTimeout(() => {
      apiCall(`/api/search?q=${encodeURIComponent(q.trim())}&role=${encodeURIComponent(role)}`)
        .then((d) => { setData({ ...EMPTY, ...d }); setActive(0); })
        .catch(() => setData(EMPTY))
        .finally(() => setBusy(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q, open, role, apiCall]);

  const items = useMemo(() => linksFor(role, data, pages, q), [role, data, pages, q]);
  const go = (item) => { onClose(); navigate(item.to); };

  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && items[active]) go(items[active]);
  };

  if (!open) return null;
  let lastGroup = '';
  const placeholder = role === 'SubjectTeacher' ? 'Search an exam, subject or class…'
    : role === 'ClassTeacher' ? 'Search a student or exam…' : 'Search students, classes, teachers, exams or pages…';
  return (
    <div className="sp-overlay" onMouseDown={onClose}>
      <div className="sp-box" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Search">
        <div className="sp-input-row">
          <span aria-hidden="true">🔎</span>
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder={placeholder} aria-label="Search" />
          {busy && <span className="spinner spinner-dark" style={{ width: 16, height: 16, borderWidth: 2 }} />}
          <kbd onClick={onClose}>Esc</kbd>
        </div>
        <div className="sp-results">
          {q.trim().length < 2 ? (
            <p className="sp-empty">Type at least 2 letters: a name, roll number, class or exam.</p>
          ) : items.length === 0 && !busy ? (
            <p className="sp-empty">Nothing found for "{q}".</p>
          ) : items.map((it, i) => {
            const head = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <div key={`${it.group}-${it.to}-${i}`}>
                {head && <p className="sp-group">{head}</p>}
                <button className={`sp-item${i === active ? ' sp-on' : ''}`} onMouseEnter={() => setActive(i)} onClick={() => go(it)}>
                  <span className="sp-icon">{it.icon}</span>
                  <span className="sp-text"><strong>{it.title}</strong><small>{it.sub}</small></span>
                  <span className="sp-go">↵</span>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
