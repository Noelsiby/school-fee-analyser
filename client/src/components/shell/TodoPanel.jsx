/**
 * "What to do next" — the jobs waiting for this person (from /api/todo), each with a button.
 * Shown at the top of every dashboard. Nothing to do → "All caught up".
 */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import './Todo.css';

export default function TodoPanel({ role }) {
  const { apiCall } = useApi();
  const navigate = useNavigate();
  const location = useLocation();
  const [items, setItems] = useState(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    apiCall(`/api/todo?role=${encodeURIComponent(role)}`).then((d) => setItems(d.items)).catch(() => setItems([]));
  }, [apiCall, role]);

  const open = (to) => {
    const [path, hash] = to.split('#');
    if (path === location.pathname && hash) document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else navigate(to);
  };

  if (items === null) return null;
  const actions = items.filter((i) => i.level === 'action').length;
  const shown = showAll ? items : items.slice(0, 5);

  return (
    <section className="td-card" aria-label="What to do next">
      <div className="td-head">
        <h2>🧭 What to do next</h2>
        {items.length > 0 && <span className={`badge ${actions ? 'badge-amber' : 'badge-blue'}`}>{actions ? `${actions} to do` : 'Just so you know'}</span>}
      </div>
      {items.length === 0 ? (
        <p className="td-done">🎉 All caught up. Nothing is waiting for you right now.</p>
      ) : (
        <ul className="td-list">
          {shown.map((it, i) => (
            <li key={`${it.text}-${i}`} className={`td-item td-${it.level}`}>
              <span className="td-icon" aria-hidden="true">{it.icon}</span>
              <div className="td-text">
                <strong>{it.text}</strong>
                {it.detail && <span>{it.detail}</span>}
              </div>
              <button className={`btn btn-sm ${it.level === 'action' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => open(it.to)}>{it.button || 'Open'} →</button>
            </li>
          ))}
        </ul>
      )}
      {items.length > 5 && (
        <button className="td-more" onClick={() => setShowAll((v) => !v)}>{showAll ? 'Show less' : `Show all ${items.length}`}</button>
      )}
    </section>
  );
}
