// Vercel serverless function: https://<your-site>/api/rafiq
// Reads ANTHROPIC_API_KEY and RAFIQ_ACCESS_CODE from Vercel's Environment Variables.
import { handleRafiqRequest } from '../server/rafiqHandler.js';

export const config = { maxDuration: 60 };

export function GET(request: Request): Promise<Response> {
  return handleRafiqRequest(request, process.env);
}

export function POST(request: Request): Promise<Response> {
  return handleRafiqRequest(request, process.env);
}
