import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, CircleHelp, Cloud, CloudOff, ListChecks, MessageSquarePlus, Send, ShieldCheck, X, XCircle } from 'lucide-react';
import { Card, CardHead, useMoney } from '../components/ui';
import { nowISO, uid, useStore } from '../store';
import { runEngine } from '../lib/rafiq/engine';
import { askClaude } from '../lib/ai';
import { addDays, diffDays, relativeDay } from '../lib/dates';
import type { ChatMessage, Conversation, RafiqResponse } from '../lib/types';
import { useOnline } from '../useOnline';

const EXAMPLES = [
  'I have 30 JOD left and nine days until payday.',
  'I want to buy something for 50 JOD. Can I afford it?',
  'I overspent this month. Help me recover.',
  'I received my salary. What should I prioritise?',
  'I have an unexpected expense of 120. Rework my plan.',
  'I want to pay off my credit card faster.',
  'Where do I stand right now?',
];

export function Rafiq() {
  const { data, today, put, addActions, setActionStatus, updateSettings, toast, getData } = useStore();
  const online = useOnline();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [convId, setConvId] = useState<string | null>(() => [...data.conversations].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))[0]?.id ?? null);
  const conv = data.conversations.find((c) => c.id === convId) ?? null;
  const aiConfigured = !!data.settings.aiAccessCode;
  const [useAi, setUseAi] = useState(data.settings.useAiByDefault && aiConfigured);
  const aiActive = useAi && online && aiConfigured;
  const endRef = useRef<HTMLDivElement>(null);
  const currency = data.settings.currency;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [conv?.messages.length, busy]);

  const openActions = data.actions.filter((a) => a.status === 'open').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1));
  const stats = useMemo(() => {
    const recent = data.actions.filter((a) => a.createdAt.slice(0, 10) >= addDays(today, -30) && a.status !== 'open');
    const done = recent.filter((a) => a.status === 'done').length;
    return { done, total: recent.length };
  }, [data.actions, today]);

  const toggleAi = async (on: boolean) => {
    if (on && !data.settings.aiConsent) {
      const ok = window.confirm(
        'When you ask Claude, Rafiq sends a summary of your finances (balances, bills, debts, goals, budgets, and recent transaction amounts and categories — never your notes) to your own Rafiq server, which forwards it to Anthropic to generate the answer.\n\nNothing is sent unless this switch is on. Continue?',
      );
      if (!ok) return;
      await updateSettings({ aiConsent: true });
    }
    setUseAi(on);
    await updateSettings({ useAiByDefault: on }); // remember the choice
  };

  const send = async (raw?: string) => {
    const message = (raw ?? text).trim();
    if (!message || busy) return;
    setText('');
    setBusy(true);
    const now = nowISO();
    const userMsg: ChatMessage = { id: uid(), role: 'user', text: message, createdAt: now };
    let c: Conversation = conv ?? { id: uid(), title: message.slice(0, 60), messages: [], createdAt: now, updatedAt: now };
    c = { ...c, messages: [...c.messages, userMsg], updatedAt: now };
    await put('conversations', c);
    setConvId(c.id);

    const snapshotData = getData();
    const engine = runEngine(message, snapshotData, today).response;
    let reply: ChatMessage = { id: uid(), role: 'rafiq', response: engine, engine: 'offline', createdAt: nowISO() };
    if (useAi && aiConfigured) {
      if (!online) reply.aiNote = 'You are offline — this answer is from the offline engine.';
      else {
        try {
          const history = c.messages.slice(-7, -1).map((x) => ({ role: x.role, text: x.text ?? `${x.response?.headline}. ${x.response?.recommendation}` }));
          const ai = await askClaude({ message, history, data: snapshotData, today, engine, accessCode: data.settings.aiAccessCode! });
          reply = { ...reply, response: ai.response, engine: 'claude', unverified: ai.unverified };
        } catch (e) {
          reply.aiNote = `Claude unavailable: ${(e as Error).message} Showing the offline answer.`;
        }
      }
    }
    await put('conversations', { ...c, messages: [...c.messages, reply], updatedAt: nowISO() });
    setBusy(false);
  };

  const commit = async (msg: ChatMessage) => {
    if (!conv || !msg.response) return;
    const r = msg.response;
    const due = addDays(today, r.followUp.inDays);
    await addActions(
      r.steps.slice(0, 5).map((s) => ({ title: s.title, detail: s.detail, amount: s.amount, dueDate: due, source: 'rafiq' as const, conversationId: conv.id })),
    );
    await put('conversations', { ...conv, messages: conv.messages.map((x) => (x.id === msg.id ? { ...x, committed: true } : x)), updatedAt: nowISO() });
    toast(`Added ${Math.min(5, r.steps.length)} actions — I’ll check in ${relativeDay(due, today)}`);
  };

  return (
    <div className="stack" style={{ minHeight: '100%' }}>
      <div className="topbar">
        <div className="title">
          <h1>Rafiq</h1>
          <span className="faint small">Your accountability partner</span>
        </div>
        <div className="row">
          {conv && (
            <button className="icon-btn" aria-label="New conversation" title="New conversation" onClick={() => setConvId(null)}>
              <MessageSquarePlus size={20} />
            </button>
          )}
        </div>
      </div>

      {(openActions.length > 0 || stats.total > 0) && (
        <Card className="tight">
          <CardHead
            title="Commitments"
            icon={<ListChecks size={18} />}
            action={stats.total > 0 ? <span className="badge brand">{stats.done}/{stats.total} done · 30 days</span> : undefined}
          />
          {openActions.length === 0 ? (
            <p className="faint small">All caught up.</p>
          ) : (
            <div className="list">
              {openActions.slice(0, 6).map((a) => (
                <div key={a.id} className="list-row">
                  <div className="main-text">
                    <div className="t">{a.title}</div>
                    <div className="s" style={a.dueDate < today ? { color: 'var(--bad)' } : undefined}>
                      {a.dueDate < today ? `Overdue ${diffDays(a.dueDate, today)}d` : `Check ${relativeDay(a.dueDate, today)}`}
                    </div>
                  </div>
                  <button className="btn sm" onClick={() => setActionStatus(a.id, 'done')} aria-label={`Done: ${a.title}`}><Check size={14} />Done</button>
                  <button className="icon-btn" onClick={() => setActionStatus(a.id, 'skipped')} aria-label={`Skip: ${a.title}`} title="Didn’t do it"><X size={16} /></button>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="chat" data-testid="chat">
        {!conv?.messages.length && (
          <Card>
            <h2 style={{ marginBottom: 6 }}>What’s happening with your money?</h2>
            <p className="muted small" style={{ marginBottom: 14 }}>
              Describe a situation in your own words. I’ll check it against your actual records and tell you what to do next — and I’ll follow up.
            </p>
            <div className="stack-sm">
              {EXAMPLES.map((e) => (
                <button key={e} className="chip" style={{ textAlign: 'left', whiteSpace: 'normal' }} onClick={() => send(e.replace(/JOD/g, currency))}>
                  {e.replace(/JOD/g, currency)}
                </button>
              ))}
            </div>
          </Card>
        )}
        {conv?.messages.map((msg) =>
          msg.role === 'user' ? (
            <div key={msg.id} className="bubble-user">{msg.text}</div>
          ) : (
            <Answer key={msg.id} msg={msg} onCommit={() => commit(msg)} />
          ),
        )}
        {busy && (
          <div className="answer" style={{ padding: 16 }}>
            <div className="typing" aria-label="Rafiq is thinking"><span /><span /><span /></div>
            {aiActive && <div className="faint xs" style={{ marginTop: 6 }}>Asking Claude…</div>}
          </div>
        )}
        <div ref={endRef} style={{ height: 12 }} />
      </div>

      <div className="composer">
        <textarea
          rows={1}
          value={text}
          placeholder="e.g. Can I afford a 40 JOD dinner this weekend?"
          aria-label="Describe your situation"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className="row between" style={{ padding: '0 4px 2px' }}>
          <label className="row small" style={{ gap: 8, cursor: aiConfigured ? 'pointer' : 'default' }} title={aiConfigured ? '' : 'Set up the Claude connection in Settings'}>
            <input type="checkbox" checked={useAi} disabled={!aiConfigured} onChange={(e) => toggleAi(e.target.checked)} data-testid="ai-toggle" />
            {aiActive ? <span className="tag-online on"><Cloud size={14} />Ask Claude</span> : <span className="tag-online"><CloudOff size={14} />{!aiConfigured ? 'Offline engine (Claude not set up)' : !online ? 'Offline — using offline engine' : 'Offline engine'}</span>}
          </label>
          <button className="btn primary sm" onClick={() => send()} disabled={!text.trim() || busy} aria-label="Send"><Send size={16} /></button>
        </div>
      </div>
    </div>
  );
}

function VerdictIcon({ v }: { v?: RafiqResponse['verdict'] }) {
  const cls = v ?? 'info';
  const icon = v === 'yes' ? <CheckCircle2 size={20} /> : v === 'no' ? <XCircle size={20} /> : v === 'caution' ? <AlertTriangle size={20} /> : <CircleHelp size={20} />;
  return <div className={`verdict ${cls}`}>{icon}</div>;
}

function Answer({ msg, onCommit }: { msg: ChatMessage; onCommit: () => void }) {
  const m = useMoney();
  const r = msg.response!;
  return (
    <article className="answer" data-testid="rafiq-answer">
      <div className="answer-head">
        <VerdictIcon v={r.verdict} />
        <div className="grow">
          <h2 style={{ fontSize: 17 }}>{r.headline}</h2>
          <div className="xs faint" style={{ marginTop: 4 }}>
            {msg.engine === 'claude' ? (
              msg.unverified?.length ? (
                <span style={{ color: 'var(--warn)' }}><AlertTriangle size={12} style={{ verticalAlign: -2 }} /> Claude · {msg.unverified.length} figure(s) not found in your records: {msg.unverified.join(', ')} — rely on the dashboard numbers</span>
              ) : (
                <span><ShieldCheck size={12} style={{ verticalAlign: -2 }} /> Claude · all figures checked against your records</span>
              )
            ) : (
              <span>Offline engine · calculated from your records</span>
            )}
          </div>
          {msg.aiNote && <div className="xs" style={{ color: 'var(--warn)', marginTop: 4 }}>{msg.aiNote}</div>}
        </div>
      </div>
      <div className="answer-body">
        <section className="answer-section">
          <h4>1 · What’s happening</h4>
          <p>{r.situation}</p>
        </section>
        {r.constraints.length > 0 && (
          <section className="answer-section">
            <h4>2 · What matters</h4>
            <ul>{r.constraints.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </section>
        )}
        <section className="answer-section">
          <h4>3 · Recommendation</h4>
          <p style={{ fontWeight: 560 }}>{r.recommendation}</p>
        </section>
        {r.steps.length > 0 && (
          <section className="answer-section">
            <h4>4 · Next steps</h4>
            <ol className="steps">
              {r.steps.map((s, i) => (
                <li key={i}>
                  <div className="grow">
                    <div style={{ fontWeight: 560 }}>{s.title}</div>
                    {s.detail && <div className="small muted">{s.detail}</div>}
                  </div>
                  {s.amount !== undefined && s.amount > 0 && !s.title.includes(m(s.amount)) && <span className="money small" style={{ fontWeight: 600 }}>{m(s.amount)}</span>}
                </li>
              ))}
            </ol>
          </section>
        )}
        {r.impact.length > 0 && (
          <section className="answer-section">
            <h4>5 · Impact</h4>
            <ul>{r.impact.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </section>
        )}
        {r.questions && r.questions.length > 0 && (
          <section className="answer-section">
            <h4>I need to know</h4>
            <ul>{r.questions.map((q, i) => <li key={i}>{q}</li>)}</ul>
          </section>
        )}
      </div>
      <div className="answer-foot">
        <span className="small"><b>6 · Follow-up</b> in {r.followUp.inDays} day{r.followUp.inDays === 1 ? '' : 's'}: <span className="muted">{r.followUp.question}</span></span>
        {r.steps.length > 0 && !r.questions?.length && (
          msg.committed ? <span className="badge good"><Check size={12} />Tracking</span> : <button className="btn primary sm" onClick={onCommit}>Commit to this plan</button>
        )}
      </div>
    </article>
  );
}
