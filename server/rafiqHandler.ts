// Server-side endpoint for optional Claude assistance.
// - The Anthropic API key lives ONLY in server environment variables.
// - Requests must carry your private access code (RAFIQ_ACCESS_CODE), so a
//   stranger who finds your website cannot spend your API credit.
// - Nothing is stored or logged here: the request is forwarded and forgotten.
import Anthropic from '@anthropic-ai/sdk';
import { timingSafeEqual } from 'node:crypto';

const DEFAULT_MODEL = 'claude-opus-5-5';
const MAX_BODY_BYTES = 200_000;
const RATE_LIMIT = { windowMs: 10 * 60_000, max: 30 };
const hits = new Map<string, number[]>();

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'headline', 'situation', 'constraints', 'recommendation', 'steps', 'impact', 'followUp', 'questions'],
  properties: {
    verdict: { type: 'string', enum: ['yes', 'no', 'caution', 'info'] },
    headline: { type: 'string' },
    situation: { type: 'string' },
    constraints: { type: 'array', items: { type: 'string' } },
    recommendation: { type: 'string' },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'detail', 'amount'],
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          amount: { anyOf: [{ type: 'number' }, { type: 'null' }] },
        },
      },
    },
    impact: { type: 'array', items: { type: 'string' } },
    followUp: {
      type: 'object',
      additionalProperties: false,
      required: ['question', 'inDays'],
      properties: { question: { type: 'string' }, inDays: { type: 'integer' } },
    },
    questions: { type: 'array', items: { type: 'string' } },
  },
} as const;

const SYSTEM_PROMPT = `You are Rafiq, the user's personal money accountability partner — not a financial advisor, not a generic chatbot.

Your job: help the user decide what to do next with their money, and help them actually do it.

How you work:
- The app has already calculated every figure from the user's own records. They are in FINANCIAL_SNAPSHOT and in ENGINE_ANALYSIS (the app's own rules-based answer to this exact message).
- Use ONLY figures that appear in those two blocks or in the user's message. Never invent, estimate or recalculate balances, totals, dates, interest or timelines. If you need a figure that is not there, say what is missing instead of guessing.
- ENGINE_ANALYSIS is numerically correct. Improve its judgement, prioritisation and wording; you may disagree with its recommendation if the snapshot clearly supports a better course, but keep its numbers.
- If the user's statement conflicts with their records (e.g. a different balance), point it out briefly and say which figure you are using.
- Do not simply agree. If a decision conflicts with their bills, debts or goals, challenge it plainly and offer a better option.
- Ask a question only when the missing answer would change the decision. Put such questions in "questions" (otherwise an empty array).
- Tone: direct, practical, calm, non-judgemental, concise. No motivational talk, no generic tips, no disclaimers about not being an advisor.
- Write amounts with the currency code, e.g. "30 JOD".

Answer in the JSON structure provided:
1. situation — what is happening financially (1–2 sentences).
2. constraints — the commitments and limits that matter (short bullet strings).
3. recommendation — the course of action (1–2 sentences). headline — the answer in under 10 words. verdict — yes / no / caution / info.
4. steps — the exact next actions, each concrete and checkable (amount = the money involved or null; detail may be "").
5. impact — the financial effect of those steps, using snapshot figures.
6. followUp — one yes/no question to check the user did it, and inDays (1–31) when to ask.`;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

function codeMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < RATE_LIMIT.windowMs);
  list.push(now);
  hits.set(key, list);
  return list.length > RATE_LIMIT.max;
}

interface Body {
  message: string;
  history?: { role: 'user' | 'rafiq'; text: string }[];
  snapshot: unknown;
  engineAnalysis: unknown;
}

export async function handleRafiqRequest(request: Request, env: Record<string, string | undefined>): Promise<Response> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  const accessCode = env.RAFIQ_ACCESS_CODE?.trim();
  const configured = !!apiKey && !!accessCode && accessCode.length >= 8;
  const provided = request.headers.get('x-rafiq-access');

  if (request.method === 'GET') {
    return json(200, {
      ok: true,
      configured,
      codeValid: configured ? codeMatches(provided, accessCode!) : false,
      model: env.RAFIQ_MODEL?.trim() || DEFAULT_MODEL,
    });
  }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  if (!configured) {
    return json(503, { error: 'Claude is not configured on the server. Set ANTHROPIC_API_KEY and RAFIQ_ACCESS_CODE (8+ characters).' });
  }
  if (!codeMatches(provided, accessCode!)) return json(401, { error: 'Access code is missing or wrong. Check Settings → Claude connection.' });
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  if (rateLimited(ip)) return json(429, { error: 'Too many requests. Try again in a few minutes.' });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json(413, { error: 'Request too large.' });
  let body: Body;
  try {
    body = JSON.parse(raw);
  } catch {
    return json(400, { error: 'Invalid JSON.' });
  }
  if (typeof body.message !== 'string' || !body.message.trim() || body.message.length > 2000) {
    return json(400, { error: 'Message must be 1–2000 characters.' });
  }

  const history = (body.history ?? [])
    .filter((h) => h && (h.role === 'user' || h.role === 'rafiq') && typeof h.text === 'string')
    .slice(-6)
    .map((h) => `${h.role === 'user' ? 'User' : 'Rafiq'}: ${h.text.slice(0, 600)}`)
    .join('\n');

  const userContent = [
    `FINANCIAL_SNAPSHOT (calculated by the app from the user's records):\n${JSON.stringify(body.snapshot)}`,
    `ENGINE_ANALYSIS (the app's rules-based answer to this message):\n${JSON.stringify(body.engineAnalysis)}`,
    history ? `RECENT_CONVERSATION:\n${history}` : '',
    `USER_MESSAGE:\n${body.message.trim()}`,
  ]
    .filter(Boolean)
    .join('\n\n');

  const client = new Anthropic({ apiKey, timeout: 55_000, maxRetries: 1 });
  try {
    const response = await client.beta.messages.create({
      model: env.RAFIQ_MODEL?.trim() || DEFAULT_MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: RESPONSE_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    });
    if (response.stop_reason === 'refusal') {
      return json(422, { error: 'Claude declined this request. The offline engine answer is shown instead.' });
    }
    if (response.stop_reason === 'max_tokens') {
      return json(502, { error: 'Claude’s answer was cut off. Try a shorter question.' });
    }
    const text = response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const parsed = JSON.parse(text);
    return json(200, { response: parsed, model: response.model });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) return json(502, { error: 'The server’s Anthropic API key was rejected. Check ANTHROPIC_API_KEY.' });
    if (err instanceof Anthropic.PermissionDeniedError) return json(502, { error: 'The API key does not have access to this model.' });
    if (err instanceof Anthropic.RateLimitError) return json(429, { error: 'Anthropic rate limit reached. Try again shortly.' });
    if (err instanceof Anthropic.BadRequestError) return json(502, { error: `Anthropic rejected the request: ${err.message}` });
    if (err instanceof Anthropic.APIConnectionError) return json(503, { error: 'Could not reach Anthropic. Check the server’s internet connection.' });
    if (err instanceof Anthropic.APIError) return json(502, { error: `Anthropic error ${err.status ?? ''}`.trim() });
    if (err instanceof SyntaxError) return json(502, { error: 'Claude returned an unreadable answer. Try again.' });
    return json(500, { error: 'Unexpected server error.' });
  }
}
