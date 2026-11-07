import { useState, useEffect, useRef, Fragment } from 'react';
import { useApi } from '../../hooks/useApi';
import './admin.css';
import './AssistantPage.css';

const EXAMPLES = [
  'How did Class 6 do in the latest exam?',
  'Which students failed Maths in the last exam?',
  'Who are the top 5 students in Class 10?',
  'Which subject is weakest in Class 8?',
  'How has Leon Siby progressed across exams?',
  'Draft a short note to Class 9 parents about extra Maths classes.',
];

// ── Tiny Markdown renderer: paragraphs, bullet/numbered lists, **bold**, pipe tables. ──
// Everything is rendered as React text, so nothing from the answer runs as HTML.
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>);
}

const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

function Markdown({ text }) {
  const lines = text.split('\n');
  const out = [];
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const head = cells(line);
      const body = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(cells(lines[i++]));
      out.push(
        <div className="as-table-wrap" key={out.length}>
          <table className="as-table">
            <thead><tr>{head.map((h, k) => <th key={k}>{inline(h)}</th>)}</tr></thead>
            <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
    } else if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      const List = ordered ? 'ol' : 'ul';
      out.push(<List key={out.length}>{items.map((t, k) => <li key={k}>{inline(t)}</li>)}</List>);
    } else if (/^#{1,4}\s+/.test(line)) {
      out.push(<p key={out.length} className="as-heading">{inline(line.replace(/^#+\s+/, ''))}</p>);
      i++;
    } else if (line.trim()) {
      const para = [];
      while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*]\s|\d+\.\s|#)/.test(lines[i])) para.push(lines[i++]);
      if (!para.length) para.push(lines[i++]);
      out.push(<p key={out.length}>{inline(para.join(' '))}</p>);
    } else {
      i++;
    }
  }
  return <>{out}</>;
}

/**
 * Admin → Assistant: ask questions about results in plain English.
 * Answers come from the school's own data through read-only lookups.
 */
export default function AssistantPage() {
  const { apiCall } = useApi();
  const [status, setStatus]     = useState(null);
  const [messages, setMessages] = useState([]);   // { role: 'user' | 'assistant', content, error? }
  const [input, setInput]       = useState('');
  const [busy, setBusy]         = useState(false);
  const endRef = useRef(null);

  const loadStatus = () => apiCall('/api/admin/assistant/status').then(setStatus).catch(() => {});
  useEffect(() => { loadStatus(); }, [apiCall]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages, busy]);

  const ask = async (question) => {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages.filter(m => !m.error).map(({ role, content }) => ({ role, content }));
    setMessages(m => [...m, { role: 'user', content: q }]);
    setInput('');
    setBusy(true);
    try {
      const d = await apiCall('/api/admin/assistant', { method: 'POST', body: { question: q, history } });
      setMessages(m => [...m, { role: 'assistant', content: d.answer }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: e.message || 'Something went wrong.', error: true }]);
    } finally {
      setBusy(false);
      loadStatus();
    }
  };

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); }
  };

  const left = status ? Math.max(0, status.budgetUsd - status.spentUsd) : null;

  return (
    <div className="admin-page as-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Assistant</h1>
          <p className="page-sub">Ask about exam results in plain English. Answers come from the school's own data; the assistant can't change anything.</p>
        </div>
        {messages.length > 0 && <button className="btn btn-ghost btn-sm" onClick={() => setMessages([])} disabled={busy}>New chat</button>}
      </div>

      {status && !status.configured && (
        <div className="alert alert-info" style={{ marginBottom: 12 }}>
          ℹ️ The AI assistant isn't set up yet. Add <code>ANTHROPIC_API_KEY</code> in Render → Environment.
        </div>
      )}

      <div className="data-card as-chat">
        <div className="as-messages" aria-live="polite">
          {messages.length === 0 && (
            <div className="as-empty">
              <p className="as-empty-title">🤖 What would you like to know?</p>
              <div className="as-examples">
                {EXAMPLES.map(ex => (
                  <button key={ex} type="button" className="as-example" onClick={() => ask(ex)} disabled={busy || !status?.configured}>{ex}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`as-msg as-${m.role} ${m.error ? 'as-error' : ''}`}>
              {m.role === 'assistant' && !m.error ? <Markdown text={m.content} /> : <p>{m.error ? `⚠ ${m.content}` : m.content}</p>}
            </div>
          ))}
          {busy && (
            <div className="as-msg as-assistant as-thinking">
              <span className="spinner spinner-dark" /> Looking through the school's data…
            </div>
          )}
          <div ref={endRef} />
        </div>

        <div className="as-input">
          <textarea
            className="form-input" rows={2} value={input} maxLength={1000}
            placeholder="Ask a question, e.g. “Which Class 7 students scored below 35% in Science?”"
            onChange={e => setInput(e.target.value)} onKeyDown={onKey} disabled={busy || !status?.configured}
            aria-label="Your question"
          />
          <button className="btn btn-primary" onClick={() => ask(input)} disabled={busy || !input.trim() || !status?.configured}>
            {busy ? <span className="spinner" /> : 'Ask'}
          </button>
        </div>
        <p className="as-foot">
          The assistant can make mistakes. Check important numbers in Results before acting on them.
          {status?.configured && left !== null && <> · This month: ${status.spentUsd.toFixed(2)} of ${status.budgetUsd} used</>}
        </p>
      </div>
    </div>
  );
}
