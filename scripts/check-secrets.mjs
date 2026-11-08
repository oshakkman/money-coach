// Safety check: fails if anything that looks like a secret or personal
// financial data is tracked by git. Run: npm run check:secrets
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const files = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
const problems = [];
for (const f of files) {
  if (/(^|\/)\.env($|\.)/.test(f) && !f.endsWith('.env.example')) problems.push(`${f}: environment file must not be committed`);
  if (/\.rafiq(\.json)?$/.test(f) || /rafiq-backup/.test(f)) problems.push(`${f}: looks like a Rafiq backup / data export`);
  if (/\.(png|woff2?|ico)$/.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  if (/sk-ant-(api|admin)\d{2}-[A-Za-z0-9_-]{20,}/.test(text)) problems.push(`${f}: contains what looks like a real Anthropic API key`);
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(text)) problems.push(`${f}: contains a private key`);
}
if (problems.length) {
  console.error('SECRET CHECK FAILED:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`Secret check passed (${files.length} tracked files).`);
