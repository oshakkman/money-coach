// Client side of the optional Claude connection. The browser never sees the
// Anthropic API key: it talks only to YOUR server endpoint (/api/rafiq), which
// holds the key in a server-side environment variable.
import type { DataSet, ISODate, RafiqResponse } from './types';
import { buildSnapshot } from './rafiq/snapshot';
import { collectNumbers, findUnverifiedFigures } from './rafiq/validate';

const ENDPOINT = '/api/rafiq';

export interface AiResult {
  response: RafiqResponse;
  unverified: string[];
  model: string;
}

function normalise(r: RafiqResponse & { steps: { title: string; detail?: string | null; amount?: number | null }[] }): RafiqResponse {
  return {
    verdict: r.verdict,
    headline: String(r.headline ?? ''),
    situation: String(r.situation ?? ''),
    constraints: (r.constraints ?? []).map(String),
    recommendation: String(r.recommendation ?? ''),
    steps: (r.steps ?? []).map((s) => ({ title: String(s.title), detail: s.detail || undefined, amount: typeof s.amount === 'number' ? s.amount : undefined })),
    impact: (r.impact ?? []).map(String),
    followUp: { question: String(r.followUp?.question ?? ''), inDays: Math.min(31, Math.max(1, Math.round(Number(r.followUp?.inDays) || 3))) },
    questions: (r.questions ?? []).filter(Boolean),
  };
}

export async function askClaude(opts: {
  message: string;
  history: { role: 'user' | 'rafiq'; text: string }[];
  data: DataSet;
  today: ISODate;
  engine: RafiqResponse;
  accessCode: string;
}): Promise<AiResult> {
  const snapshot = buildSnapshot(opts.data, opts.today);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 70_000);
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-rafiq-access': opts.accessCode },
      body: JSON.stringify({ message: opts.message, history: opts.history, snapshot, engineAnalysis: opts.engine }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new Error((e as Error).name === 'AbortError' ? 'Claude took too long to answer.' : 'Could not reach your Rafiq server (are you offline?).');
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Server error ${res.status}`);
  const response = normalise(body.response);
  if (!response.headline || !response.recommendation) throw new Error('Claude returned an incomplete answer.');
  // Independent validation: every money figure must trace back to the app's own numbers.
  const known = [...collectNumbers(snapshot), ...collectNumbers(opts.engine), ...collectNumbers(opts.message)];
  return { response, unverified: findUnverifiedFigures(response, known), model: body.model ?? 'claude' };
}

export async function checkConnection(accessCode: string): Promise<{ configured: boolean; codeValid: boolean; model?: string; error?: string }> {
  try {
    const res = await fetch(ENDPOINT, { headers: { 'x-rafiq-access': accessCode } });
    if (!res.ok) return { configured: false, codeValid: false, error: `Server responded ${res.status}` };
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('json')) return { configured: false, codeValid: false, error: 'No Rafiq server here (this copy is running without the online part).' };
    return await res.json();
  } catch {
    return { configured: false, codeValid: false, error: 'Could not reach the server. Are you offline?' };
  }
}
