import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, createSign } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:https';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';

type Channel = 'staging' | 'production';
type ResponseMode =
  | 'valid'
  | 'same-manifest-id'
  | 'invalid-signature'
  | 'asset-hash'
  | 'missing-asset';

const require = createRequire(import.meta.url);
const helperPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../scripts/export-ota.ts');
const tsxLoaderPath = require.resolve('tsx');
const keyid = 'test-key';
const runtimeVersion = 'a'.repeat(64);
const sourceSha = 'b'.repeat(40);

interface ExportFixture {
  artifactDir: string;
  bundle: { hash: string; hex: string; bytes: Buffer };
  assets: { hash: string; hex: string; bytes: Buffer; path: string }[];
  files: { path: string; size: number; sha256: string }[];
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function base64UrlSha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('base64url');
}

function createExportFixture(root: string): ExportFixture {
  mkdirSync(join(root, 'assets'), { recursive: true });
  const bundle = Buffer.from('bundle bytes for OTA behavior verification\n');
  const assets = [
    { path: 'assets/first.bin', bytes: Buffer.from('first asset bytes\n'), ext: 'bin' },
    { path: 'assets/second.bin', bytes: Buffer.from('second asset bytes\n'), ext: 'bin' },
  ];
  writeFileSync(join(root, 'bundle.js'), bundle);
  for (const asset of assets) {
    writeFileSync(join(root, asset.path), asset.bytes);
  }
  const metadata = {
    version: 0,
    bundler: 'metro',
    fileMetadata: {
      android: {
        bundle: 'bundle.js',
        assets: assets.map(({ path, ext }) => ({ path, ext })),
      },
    },
  };
  const metadataBytes = Buffer.from(JSON.stringify(metadata));
  writeFileSync(join(root, 'metadata.json'), metadataBytes);
  const inventory = [
    { path: 'bundle.js', bytes: bundle },
    ...assets.map(({ path, bytes }) => ({ path, bytes })),
  ]
    .map(({ path, bytes }) => ({ path, size: bytes.byteLength, sha256: sha256(bytes) }))
    .sort((left, right) => left.path.localeCompare(right.path));
  writeFileSync(
    join(root, 'provenance.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        project: 'kosmo-native',
        platform: 'android',
        channel: 'staging',
        keyid,
        runtimeVersion,
        sourceSha,
        metadataSha256: sha256(metadataBytes),
        files: inventory,
        exportedAt: '2026-09-10T00:00:00.000Z',
      },
      null,
      2,
    )}\n`,
  );
  return {
    artifactDir: root,
    bundle: {
      hash: base64UrlSha256(bundle),
      hex: sha256(bundle),
      bytes: bundle,
    },
    assets: assets.map(({ path, bytes }) => ({
      path,
      hash: base64UrlSha256(bytes),
      hex: sha256(bytes),
      bytes,
    })),
    files: inventory,
  };
}

function generateTestCertificate(root: string): { certificatePath: string; keyPath: string } {
  const certificatePath = join(root, 'test-certificate.pem');
  const keyPath = join(root, 'test-private-key.pem');
  const result = spawnSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-keyout',
      keyPath,
      '-out',
      certificatePath,
      '-days',
      '1',
      '-subj',
      '/CN=kosmo-ota-test',
      '-addext',
      'subjectAltName=IP:127.0.0.1',
      '-addext',
      'basicConstraints=critical,CA:TRUE',
    ],
    { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] },
  );
  assert.equal(result.status, 0, result.stderr);
  mkdirSync(join(root, 'certs'), { recursive: true });
  copyFileSync(certificatePath, join(root, 'certs/certificate.pem'));
  return { certificatePath, keyPath };
}

function responseBody(
  fixture: ExportFixture,
  channel: Channel,
  origin: string,
  privateKey: string,
  mode: ResponseMode,
): Buffer {
  const prefix = `${origin}/releases/kosmo-native/android/${channel}/${runtimeVersion}`;
  const manifest = {
    id:
      mode === 'same-manifest-id'
        ? 'staging-manifest-1'
        : `${channel}-manifest-${channel === 'staging' ? '1' : '2'}`,
    runtimeVersion,
    launchAsset: {
      hash: fixture.bundle.hash,
      url: `${prefix}/assets/${fixture.bundle.hex}`,
    },
    assets: fixture.assets.map((asset) => ({
      hash: asset.hash,
      url: `${prefix}/assets/${asset.hex}`,
    })),
  };
  const json = Buffer.from(JSON.stringify(manifest));
  const signatureBytes = createSign('RSA-SHA256').update(json).sign(privateKey);
  if (mode === 'invalid-signature') {
    signatureBytes[0] ^= 1;
  }
  const boundary = 'kosmo-ota-test-boundary';
  const signature = signatureBytes.toString('base64');
  return Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json\r\nexpo-signature: sig="${signature}", keyid="${keyid}", alg="rsa-v1_5-sha256"\r\n\r\n`,
    ),
    json,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
}

function makeServer(
  fixture: ExportFixture,
  certificatePath: string,
  keyPath: string,
): { server: ReturnType<typeof createServer>; setMode: (mode: ResponseMode) => void } {
  let mode: ResponseMode = 'valid';
  const assetBytes = new Map<string, Buffer>([
    [fixture.bundle.hex, fixture.bundle.bytes],
    ...fixture.assets.map((asset) => [asset.hex, asset.bytes] as const),
  ]);
  const firstAssetHex = fixture.assets[0]!.hex;
  const server = createServer(
    { cert: readFileSync(certificatePath), key: readFileSync(keyPath) },
    (request: IncomingMessage, response: ServerResponse) => {
      const host = request.headers.host;
      if (!host) {
        response.writeHead(400).end();
        return;
      }
      const requestUrl = new URL(request.url ?? '/', `https://${host}`);
      const assetMatch = /\/assets\/([0-9a-f]{64})$/u.exec(requestUrl.pathname);
      if (assetMatch) {
        const hex = assetMatch[1]!;
        if (mode === 'missing-asset' && hex === firstAssetHex) {
          response.writeHead(404).end();
          return;
        }
        const bytes = assetBytes.get(hex);
        if (!bytes) {
          response.writeHead(404).end();
          return;
        }
        const body =
          mode === 'asset-hash' && hex === firstAssetHex ? Buffer.from('tampered') : bytes;
        response.writeHead(200, { 'content-type': 'application/octet-stream' }).end(body);
        return;
      }
      const manifestMatch =
        /\/releases\/kosmo-native\/android\/(staging|production)\/([a-f0-9]{64})\/manifest\.json$/u.exec(
          requestUrl.pathname,
        );
      if (!manifestMatch || manifestMatch[2] !== runtimeVersion) {
        response.writeHead(404).end();
        return;
      }
      const body = responseBody(
        fixture,
        manifestMatch[1] as Channel,
        `https://${host}`,
        readFileSync(keyPath, 'utf8'),
        mode,
      );
      response
        .writeHead(200, {
          'content-type': 'multipart/mixed; boundary="kosmo-ota-test-boundary"',
          'expo-protocol-version': '1',
          'expo-sfv-version': '0',
        })
        .end(body);
    },
  );
  return { server, setMode: (nextMode) => (mode = nextMode) };
}

function listen(server: ReturnType<typeof createServer>): Promise<number> {
  return new Promise((resolvePort, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('HTTPS test server did not expose a port.'));
        return;
      }
      resolvePort(address.port);
    });
  });
}

function close(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
}

async function runHelper(
  appRoot: string,
  artifactDir: string,
  certificatePath: string,
  args: string[],
): Promise<{ status: number | null; stdout: string; stderr: string; output: string }> {
  const outputPath = join(artifactDir, 'github-output');
  writeFileSync(outputPath, '');
  const child = spawn(process.execPath, ['--import', tsxLoaderPath, helperPath, ...args], {
    cwd: appRoot,
    env: {
      ...process.env,
      GITHUB_OUTPUT: outputPath,
      NODE_EXTRA_CA_CERTS: certificatePath,
    },
  });
  const chunks = { stdout: '', stderr: '' };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => (chunks.stdout += chunk));
  child.stderr.on('data', (chunk: string) => (chunks.stderr += chunk));
  const status = await new Promise<number | null>((resolveStatus, rejectStatus) => {
    child.once('error', rejectStatus);
    child.once('close', resolveStatus);
  });
  return { ...chunks, status, output: readFileSync(outputPath, 'utf8') };
}

function verifyArgs(
  channel: Channel,
  artifactDir: string,
  baseUrl: string,
  sourceManifestId?: string,
): string[] {
  return [
    'verify',
    '--platform',
    'android',
    '--channel',
    channel,
    '--keyid',
    keyid,
    '--runtime-version',
    runtimeVersion,
    ...(sourceManifestId ? ['--source-manifest-id', sourceManifestId] : []),
    '--public-base-url',
    baseUrl,
    '--output-dir',
    artifactDir,
  ];
}

function promoteArgs(
  operation: 'promote' | 'recover',
  sourceChannel: Channel,
  artifactDir: string,
  baseUrl: string,
): string[] {
  return [
    'promote',
    '--operation',
    operation,
    '--platform',
    'android',
    '--source-channel',
    sourceChannel,
    '--keyid',
    keyid,
    '--public-base-url',
    baseUrl,
    '--output-dir',
    artifactDir,
  ];
}

test('verifies OTA manifests and preserves export bytes across promotion and recovery', async () => {
  const root = mkdtempSync(join(tmpdir(), 'kosmo-ota-behavior-'));
  const { certificatePath, keyPath } = generateTestCertificate(root);
  const appRoot = join(root, 'app');
  mkdirSync(join(appRoot, 'certs'), { recursive: true });
  copyFileSync(certificatePath, join(appRoot, 'certs/certificate.pem'));
  const fixture = createExportFixture(join(root, 'fixture'));
  const { server, setMode } = makeServer(fixture, certificatePath, keyPath);
  const port = await listen(server);
  const baseUrl = `https://127.0.0.1:${port}`;
  try {
    setMode('valid');
    const stagingVerification = await runHelper(
      appRoot,
      fixture.artifactDir,
      certificatePath,
      verifyArgs('staging', fixture.artifactDir, baseUrl),
    );
    assert.equal(stagingVerification.status, 0, stagingVerification.stderr);
    const verifiedProvenance = JSON.parse(
      readFileSync(join(fixture.artifactDir, 'provenance.json'), 'utf8'),
    ) as {
      files: ExportFixture['files'];
      verification: { channel: Channel; manifestId: string; assetCount: number };
    };
    assert.deepEqual(verifiedProvenance.files, fixture.files);
    assert.equal(verifiedProvenance.verification.channel, 'staging');
    assert.equal(verifiedProvenance.verification.manifestId, 'staging-manifest-1');
    assert.equal(verifiedProvenance.verification.assetCount, 3);
    assert.match(stagingVerification.output, new RegExp(`runtime_version=${runtimeVersion}`));

    const promotion = await runHelper(
      appRoot,
      fixture.artifactDir,
      certificatePath,
      promoteArgs('promote', 'staging', fixture.artifactDir, baseUrl),
    );
    assert.equal(promotion.status, 0, promotion.stderr);
    const promotionRecord = JSON.parse(
      readFileSync(join(fixture.artifactDir, 'promotion.json'), 'utf8'),
    ) as {
      operation: string;
      runtimeVersion: string;
      sourceManifestId: string;
      sourceFiles: ExportFixture['files'];
    };
    assert.equal(promotionRecord.operation, 'promote');
    assert.equal(promotionRecord.runtimeVersion, runtimeVersion);
    assert.equal(promotionRecord.sourceManifestId, 'staging-manifest-1');
    assert.deepEqual(promotionRecord.sourceFiles, fixture.files);

    const recoveryFixture = createExportFixture(join(root, 'recovery-fixture'));
    const productionVerification = await runHelper(
      appRoot,
      recoveryFixture.artifactDir,
      certificatePath,
      verifyArgs('production', recoveryFixture.artifactDir, baseUrl, 'staging-manifest-1'),
    );
    assert.equal(productionVerification.status, 0, productionVerification.stderr);
    setMode('invalid-signature');
    const recovery = await runHelper(
      appRoot,
      recoveryFixture.artifactDir,
      certificatePath,
      promoteArgs('recover', 'production', recoveryFixture.artifactDir, baseUrl),
    );
    assert.equal(recovery.status, 0, recovery.stderr);
    const recoveryRecord = JSON.parse(
      readFileSync(join(recoveryFixture.artifactDir, 'promotion.json'), 'utf8'),
    ) as {
      operation: string;
      runtimeVersion: string;
      sourceManifestId: string;
      sourceFiles: ExportFixture['files'];
    };
    assert.equal(recoveryRecord.operation, 'recover');
    assert.equal(recoveryRecord.runtimeVersion, runtimeVersion);
    assert.equal(recoveryRecord.sourceManifestId, 'production-manifest-2');
    assert.deepEqual(recoveryRecord.sourceFiles, promotionRecord.sourceFiles);
    for (const file of ['metadata.json', 'bundle.js', 'assets/first.bin', 'assets/second.bin']) {
      assert.deepEqual(
        readFileSync(join(fixture.artifactDir, file)),
        readFileSync(join(recoveryFixture.artifactDir, file)),
        file,
      );
    }

    const sameManifestFixture = createExportFixture(join(root, 'same-manifest-id'));
    setMode('same-manifest-id');
    const sameManifest = await runHelper(
      appRoot,
      sameManifestFixture.artifactDir,
      certificatePath,
      verifyArgs('production', sameManifestFixture.artifactDir, baseUrl, 'staging-manifest-1'),
    );
    assert.notEqual(sameManifest.status, 0);
    assert.match(
      `${sameManifest.stdout}\n${sameManifest.stderr}`,
      /Production verification requires a new manifest ID\./u,
    );
    const sameManifestProvenance = JSON.parse(
      readFileSync(join(sameManifestFixture.artifactDir, 'provenance.json'), 'utf8'),
    ) as { verification?: unknown };
    assert.equal(sameManifestProvenance.verification, undefined);

    for (const [mode, expectedMessage] of [
      ['invalid-signature', 'OTA manifest signature verification failed.'],
      ['asset-hash', 'OTA asset 1 hash verification failed.'],
      ['missing-asset', 'OTA asset 1 request failed with HTTP 404.'],
    ] as const) {
      const invalidFixture = createExportFixture(join(root, mode));
      setMode(mode);
      const result = await runHelper(
        appRoot,
        invalidFixture.artifactDir,
        certificatePath,
        verifyArgs('staging', invalidFixture.artifactDir, baseUrl),
      );
      assert.notEqual(result.status, 0, mode);
      assert.match(`${result.stdout}\n${result.stderr}`, new RegExp(expectedMessage));
      const failedProvenance = JSON.parse(
        readFileSync(join(invalidFixture.artifactDir, 'provenance.json'), 'utf8'),
      ) as { verification?: unknown };
      assert.equal(failedProvenance.verification, undefined, mode);
    }
  } finally {
    await close(server);
    rmSync(root, { recursive: true, force: true });
  }
});
