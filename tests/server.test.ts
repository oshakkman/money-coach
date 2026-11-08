import { describe, expect, it } from 'vitest';
import { handleRafiqRequest } from '../api/rafiq';

const env = { ANTHROPIC_API_KEY: 'sk-ant-test', RAFIQ_ACCESS_CODE: 'my-private-code-123' };
const post = (headers: Record<string, string>, body: unknown = { message: 'hi', snapshot: {}, engineAnalysis: {} }) =>
  new Request('http://x/api/rafiq', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });

describe('server endpoint protection', () => {
  it('reports not configured without a key', async () => {
    const r = await handleRafiqRequest(new Request('http://x/api/rafiq'), {});
    expect(await r.json()).toMatchObject({ configured: false });
    const p = await handleRafiqRequest(post({ 'x-rafiq-access': 'x' }), {});
    expect(p.status).toBe(503);
  });
  it('rejects a missing or wrong access code before calling Anthropic', async () => {
    expect((await handleRafiqRequest(post({}), env)).status).toBe(401);
    expect((await handleRafiqRequest(post({ 'x-rafiq-access': 'wrong-code-123456' }), env)).status).toBe(401);
  });
  it('validates the message', async () => {
    const r = await handleRafiqRequest(post({ 'x-rafiq-access': env.RAFIQ_ACCESS_CODE }, { message: '' }), env);
    expect(r.status).toBe(400);
  });
  it('health check confirms a valid code without exposing secrets', async () => {
    const r = await handleRafiqRequest(new Request('http://x/api/rafiq', { headers: { 'x-rafiq-access': env.RAFIQ_ACCESS_CODE } }), env);
    const body = await r.json();
    expect(body).toMatchObject({ configured: true, codeValid: true });
    expect(JSON.stringify(body)).not.toContain('sk-ant');
  });
});
