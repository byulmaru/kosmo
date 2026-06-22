import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.OIDC_MOCK_PORT ?? 4300);
const clientId = process.env.PUBLIC_OIDC_CLIENT_ID ?? 'kosmo-e2e-client';
const clientSecret = process.env.OIDC_CLIENT_SECRET ?? 'kosmo-e2e-secret';
const codes = new Map();

const sendJson = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

const readJsonBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const createCodeChallenge = (codeVerifier) =>
  createHash('sha256').update(codeVerifier).digest('base64url');

const createIdToken = ({ name, sub }) => {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ name, sub })).toString('base64url');

  return `${header}.${payload}.`;
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
    return;
  }

  if (request.method === 'GET' && url.pathname === '/oauth/authorize') {
    const responseType = url.searchParams.get('response_type');
    const requestClientId = url.searchParams.get('client_id');
    const redirectUri = url.searchParams.get('redirect_uri');
    const codeChallenge = url.searchParams.get('code_challenge');
    const codeChallengeMethod = url.searchParams.get('code_challenge_method');
    const state = url.searchParams.get('state');

    if (
      responseType !== 'code' ||
      requestClientId !== clientId ||
      !redirectUri ||
      !codeChallenge ||
      codeChallengeMethod !== 'S256' ||
      !state
    ) {
      sendJson(response, 400, { error: 'invalid_authorization_request' });
      return;
    }

    const code = randomUUID();
    codes.set(code, {
      codeChallenge,
      name: 'E2E User',
      redirectUri,
      sub: `oidc-mock-${code}`,
    });

    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', code);
    callbackUrl.searchParams.set('state', state);

    response.writeHead(302, { location: callbackUrl.toString() });
    response.end();
    return;
  }

  if (request.method === 'POST' && url.pathname === '/oauth/token') {
    let body;
    try {
      body = await readJsonBody(request);
    } catch {
      sendJson(response, 400, { error: 'invalid_json' });
      return;
    }

    const codeData = codes.get(body.code);
    if (
      body.grant_type !== 'authorization_code' ||
      body.client_id !== clientId ||
      body.client_secret !== clientSecret ||
      !codeData ||
      body.redirect_uri !== codeData.redirectUri ||
      createCodeChallenge(body.code_verifier ?? '') !== codeData.codeChallenge
    ) {
      sendJson(response, 400, { error: 'invalid_grant' });
      return;
    }

    codes.delete(body.code);
    sendJson(response, 200, {
      access_token: `mock-access-${body.code}`,
      id_token: createIdToken(codeData),
      token_type: 'Bearer',
    });
    return;
  }

  sendJson(response, 404, { error: 'not_found' });
});

server.listen(port, '127.0.0.1');

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});
