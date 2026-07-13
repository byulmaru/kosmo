import { createHash, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { createServer } from 'node:http';

const port = Number(process.env.OIDC_MOCK_PORT ?? 4300);
const host = process.env.OIDC_MOCK_HOST ?? '127.0.0.1';
const issuer = process.env.PUBLIC_OIDC_ISSUER ?? `http://${host}:${port}`;
const webClientId = process.env.PUBLIC_OIDC_CLIENT_ID ?? 'kosmo-e2e-client';
const webClientSecret = process.env.OIDC_CLIENT_SECRET ?? 'kosmo-e2e-secret';
const nativeClientId = process.env.PUBLIC_OIDC_NATIVE_CLIENT_ID ?? 'kosmo-e2e-native-client';
const clients = new Map([
  [webClientId, { secret: webClientSecret, type: 'confidential' }],
  [nativeClientId, { type: 'public' }],
]);
const keyId = 'kosmo-e2e-signing-key';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = {
  ...publicKey.export({ format: 'jwk' }),
  alg: 'RS256',
  kid: keyId,
  use: 'sig',
};
const codes = new Map();
let tokenRequestCount = 0;

const sendJson = (response, status, body) => {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
};

const readFormBody = async (request) => {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
};

const createCodeChallenge = (codeVerifier) =>
  createHash('sha256').update(codeVerifier).digest('base64url');

const createIdToken = ({ clientId, email, email_verified: emailVerified, name, sub }) => {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: keyId, typ: 'JWT' })).toString(
    'base64url',
  );
  const payload = Buffer.from(
    JSON.stringify({
      aud: clientId,
      email,
      email_verified: emailVerified,
      exp: issuedAt + 300,
      iat: issuedAt,
      iss: issuer,
      name,
      sub,
    }),
  ).toString('base64url');
  const signingInput = `${header}.${payload}`;

  return `${signingInput}.${sign('RSA-SHA256', Buffer.from(signingInput), privateKey).toString(
    'base64url',
  )}`;
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? '127.0.0.1'}`);

  if (request.method === 'GET' && url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
    return;
  }

  if (request.method === 'GET' && url.pathname === '/__e2e/token-requests') {
    sendJson(response, 200, { count: tokenRequestCount });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
    sendJson(response, 200, {
      authorization_endpoint: `${issuer}/oauth/authorize`,
      code_challenge_methods_supported: ['S256'],
      id_token_signing_alg_values_supported: ['RS256'],
      issuer,
      jwks_uri: `${issuer}/oauth/jwks`,
      response_types_supported: ['code'],
      scopes_supported: ['openid', 'profile'],
      subject_types_supported: ['public'],
      token_endpoint: `${issuer}/oauth/token`,
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
    });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/oauth/jwks') {
    sendJson(response, 200, { keys: [publicJwk] });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/oauth/authorize') {
    const responseType = url.searchParams.get('response_type');
    const requestClientId = url.searchParams.get('client_id');
    const redirectUri = url.searchParams.get('redirect_uri');
    const codeChallenge = url.searchParams.get('code_challenge');
    const codeChallengeMethod = url.searchParams.get('code_challenge_method');
    const invalidSignature = url.searchParams.get('login_hint') === 'invalid-signature';
    const state = url.searchParams.get('state');
    const client = clients.get(requestClientId);

    if (
      responseType !== 'code' ||
      !client ||
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
      clientId: requestClientId,
      codeChallenge,
      email: 'e2e-user@example.test',
      email_verified: true,
      invalidSignature,
      name: 'E2E User',
      redirectUri,
      sub: 'oidc-mock-e2e-user',
    });

    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', code);
    callbackUrl.searchParams.set('state', state);

    response.writeHead(302, { location: callbackUrl.toString() });
    response.end();
    return;
  }

  if (request.method === 'POST' && url.pathname === '/oauth/token') {
    tokenRequestCount += 1;

    if (!request.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) {
      sendJson(response, 400, { error: 'invalid_request' });
      return;
    }

    const body = await readFormBody(request);
    const code = body.get('code');
    const codeData = code ? codes.get(code) : undefined;
    const client = codeData ? clients.get(codeData.clientId) : undefined;
    const hasValidClientAuthentication =
      client?.type === 'confidential'
        ? body.get('client_secret') === client.secret
        : client?.type === 'public' && body.get('client_secret') === null;

    if (
      body.get('grant_type') !== 'authorization_code' ||
      !client ||
      body.get('client_id') !== codeData?.clientId ||
      !hasValidClientAuthentication ||
      !codeData ||
      body.get('redirect_uri') !== codeData.redirectUri ||
      createCodeChallenge(body.get('code_verifier') ?? '') !== codeData.codeChallenge
    ) {
      sendJson(response, 400, { error: 'invalid_grant' });
      return;
    }

    codes.delete(code);
    const idToken = createIdToken(codeData);
    const [header, payload, signature] = idToken.split('.');
    sendJson(response, 200, {
      access_token: `mock-access-${code}`,
      id_token: codeData.invalidSignature
        ? `${header}.${payload}.${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`
        : idToken,
      token_type: 'Bearer',
    });
    return;
  }

  sendJson(response, 404, { error: 'not_found' });
});

server.listen(port, host);

process.on('SIGTERM', () => {
  server.close(() => {
    process.exit(0);
  });
});
