import { timingSafeEqual } from 'node:crypto';
import { chmod, mkdir, rename, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';

const port = Number.parseInt(process.env.PORT ?? '8787', 10);
const expectedState = process.env.VK_OAUTH_STATE ?? 'disabled';
const resultFile = process.env.VK_OAUTH_RESULT_FILE ?? '/data/callback.json';

function send(response, status, body, contentType = 'text/plain; charset=utf-8') {
  response.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  response.end(body);
}

function normalizePath(pathname) {
  if (pathname === '/vk-oauth') return '/';
  if (pathname.startsWith('/vk-oauth/')) return pathname.slice('/vk-oauth'.length);
  return pathname;
}

function statesMatch(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

async function saveResult(payload) {
  const directory = path.dirname(resultFile);
  const temporaryFile = `${resultFile}.tmp`;

  await mkdir(directory, { recursive: true });
  await writeFile(temporaryFile, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  await chmod(temporaryFile, 0o600);
  await rename(temporaryFile, resultFile);
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method !== 'GET' || !request.url || request.url.length > 4096) {
      send(response, 405, 'Method not allowed.');
      return;
    }

    const url = new URL(request.url, 'http://callback.internal');
    const pathname = normalizePath(url.pathname);

    if (pathname === '/health') {
      send(response, 200, 'ok');
      return;
    }

    if (pathname === '/') {
      send(response, 200, 'VK OAuth callback is ready.');
      return;
    }

    if (pathname !== '/callback') {
      send(response, 404, 'Not found.');
      return;
    }

    if (expectedState === 'disabled') {
      send(response, 503, 'VK OAuth callback is not armed.');
      return;
    }

    const state = url.searchParams.get('state') ?? '';
    if (!statesMatch(state, expectedState)) {
      send(response, 403, 'Invalid OAuth state.');
      return;
    }

    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');
    if (!code && !error) {
      send(response, 400, 'Missing authorization result.');
      return;
    }

    await saveResult({
      received_at: new Date().toISOString(),
      code,
      device_id: url.searchParams.get('device_id'),
      error,
      error_description: url.searchParams.get('error_description'),
    });

    send(
      response,
      200,
      '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>VK OAuth</title><body><h1>Авторизация получена</h1><p>Это окно можно закрыть.</p></body></html>',
      'text/html; charset=utf-8',
    );
  } catch {
    send(response, 500, 'Callback processing failed.');
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`VK OAuth callback listening on port ${port}`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
