import { useEffect, useId, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { formatMoney } from '../lib/money';
import { useStore } from '../store';

export function Money({ value, sign, className }: { value: number; sign?: boolean; className?: string }) {
  const { data } = useStore();
  return <span className={`money ${className ?? ''}`}>{formatMoney(value, data.settings.currency, { sign })}</span>;
}

export function useMoney() {
  const { data } = useStore();
  return (n: number, opts?: { sign?: boolean; compact?: boolean }) => formatMoney(n, data.settings.currency, opts);
}

export function Card({ children, className = '', ...rest }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section className={`card ${className}`} {...rest}>
      {children}
    </section>
  );
}

export function CardHead({ title, icon, action }: { title: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card-head">
      <h2>
        {icon}
        {title}
      </h2>
      {action}
    </div>
  );
}

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="grabber" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        {children}
        {footer && <div className="sheet-actions">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, full }: { label: string; hint?: ReactNode; error?: string | null; children: (id: string) => ReactNode; full?: boolean }) {
  const id = useId();
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {error ? <span className="error">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="switch">
      <span className="grow">
        <span style={{ fontWeight: 560 }}>{label}</span>
        {hint && <span className="faint xs" style={{ display: 'block' }}>{hint}</span>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="track" />
    </label>
  );
}

export function Progress({ value, tone }: { value: number; tone?: 'good' | 'warn' | 'bad' }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`progress ${tone ?? ''}`} role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <div className="l">{label}</div>
      <div className="v">{value}</div>
      {sub && <div className="s">{sub}</div>}
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon}
      <div style={{ fontWeight: 600, color: 'var(--ink-2)' }}>{title}</div>
      {children && <div className="small" style={{ marginTop: 4 }}>{children}</div>}
    </div>
  );
}

export function KV({ k, v, total }: { k: ReactNode; v: ReactNode; total?: boolean }) {
  return (
    <div className={`kv ${total ? 'total' : ''}`}>
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

export function confirmAction(message: string): boolean {
  return window.confirm(message);
}
