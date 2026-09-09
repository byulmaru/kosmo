import { spawnSync } from 'node:child_process';
import { createHash, verify as verifySignature, X509Certificate } from 'node:crypto';
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { z } from 'zod';

type Platform = 'android' | 'ios';
type Channel = 'staging' | 'production';

const PROJECT = 'kosmo-native';

interface ExportFile {
  path: string;
  size: number;
  sha256: string;
}

interface Provenance {
  schemaVersion: 1;
  project: typeof PROJECT;
  platform: Platform;
  channel: Channel;
  keyid: string;
  runtimeVersion: string;
  sourceSha: string;
  metadataSha256: string;
  files: ExportFile[];
  exportedAt: string;
  verification?: {
    status: 'verified';
    channel: Channel;
    manifestUrl: string;
    manifestId: string;
    manifestSha256: string;
    assetCount: number;
    verifiedAt: string;
  };
}

const platformSchema = z.enum(['android', 'ios']);
const channelSchema = z.enum(['staging', 'production']);
const exportFileSchema = z.object({
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
});
const provenanceSchema = z.object({
  schemaVersion: z.literal(1),
  project: z.literal(PROJECT),
  platform: platformSchema,
  channel: channelSchema,
  keyid: z
    .string()
    .regex(/^[A-Za-z0-9._-]+$/u)
    .refine((value) => value !== '.' && value !== '..'),
  runtimeVersion: z.string().regex(/^[a-f0-9]{40,64}$/u),
  sourceSha: z.string().regex(/^[a-f0-9]{40}$/u),
  metadataSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  files: z.array(exportFileSchema).min(1),
  exportedAt: z.string().min(1),
  verification: z
    .object({
      status: z.literal('verified'),
      channel: channelSchema,
      manifestUrl: z.string().url(),
      manifestId: z.string().min(1),
      manifestSha256: z.string().regex(/^[a-f0-9]{64}$/u),
      assetCount: z.number().int().positive(),
      verifiedAt: z.string().min(1),
    })
    .optional(),
});
const metadataSchema = z.object({
  version: z.literal(0),
  bundler: z.literal('metro'),
  fileMetadata: z.record(z.string(), z.unknown()),
});
const platformMetadataSchema = z.object({
  bundle: z.string().min(1),
  assets: z.array(z.object({ path: z.string().min(1), ext: z.string() })),
});
const runtimeVersionResultSchema = z.object({ runtimeVersion: z.string() });

function error(message: string): never {
  throw new Error(message);
}

const argumentOptions = {
  channel: { type: 'string' },
  keyid: { type: 'string' },
  operation: { type: 'string' },
  'output-dir': { type: 'string' },
  platform: { type: 'string' },
  'public-base-url': { type: 'string' },
  'runtime-version': { type: 'string' },
  'source-manifest-id': { type: 'string' },
  'source-channel': { type: 'string' },
  'source-sha': { type: 'string' },
} as const;

function args(argv: string[]): Map<string, string> {
  try {
    const { values } = parseArgs({
      args: argv,
      options: argumentOptions,
      allowPositionals: false,
      strict: true,
    });
    return new Map(
      Object.entries(values).flatMap(([name, value]) =>
        typeof value === 'string' ? [[name, value] as const] : [],
      ),
    );
  } catch (caught: unknown) {
    error(caught instanceof Error ? caught.message : 'Invalid command arguments.');
  }
}

function commandArgs(argv: string[]): {
  command: 'export' | 'verify' | 'promote';
  values: Map<string, string>;
} {
  const [command, ...rest] = argv;
  if (command !== 'export' && command !== 'verify' && command !== 'promote') {
    error('Usage: export-ota.ts <export|verify|promote> [options]');
  }
  return { command, values: args(rest) };
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name)?.trim();
  if (!value) {
    error(`--${name} is required.`);
  }
  return value;
}

function platform(values: Map<string, string>): Platform {
  const value = required(values, 'platform');
  if (value !== 'ios' && value !== 'android') {
    error('--platform must be ios or android.');
  }
  return value;
}

function channel(values: Map<string, string>): Channel {
  const value = required(values, 'channel');
  if (value !== 'staging' && value !== 'production') {
    error('--channel must be staging or production.');
  }
  return value;
}

function run(command: string, commandArgs: string[], cwd: string, capture = false): string {
  const result = spawnSync(command, commandArgs, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    error(`${command} ${commandArgs.join(' ')} failed.`);
  }
  return typeof result.stdout === 'string' ? result.stdout : '';
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function filePathWithin(root: string, relativePath: string): string {
  const normalized = relativePath.replaceAll('\\', '/');
  if (
    !normalized ||
    normalized.includes('\u0000') ||
    /^[\\/]/u.test(normalized) ||
    /^[A-Za-z]:[\\/]/u.test(normalized)
  ) {
    error(`metadata.json contains an invalid path: ${relativePath}`);
  }
  const candidate = resolve(root, normalized);
  const lexicalRelative = relative(root, candidate);
  if (!lexicalRelative || lexicalRelative.startsWith('..') || isAbsolute(lexicalRelative)) {
    error(`metadata.json contains a path outside the export directory: ${relativePath}`);
  }
  let resolvedRoot: string;
  let resolvedCandidate: string;
  try {
    resolvedRoot = realpathSync(root);
    resolvedCandidate = realpathSync(candidate);
  } catch {
    error(`Export file not found: ${relativePath}`);
  }
  const actualRelative = relative(resolvedRoot, resolvedCandidate);
  if (!actualRelative || actualRelative.startsWith('..') || isAbsolute(actualRelative)) {
    error(`metadata.json contains a path outside the export directory: ${relativePath}`);
  }
  let fileStat: ReturnType<typeof statSync>;
  try {
    fileStat = statSync(candidate);
  } catch {
    error(`Export file not found: ${relativePath}`);
  }
  if (!fileStat.isFile()) {
    error(`Export path is not a file: ${relativePath}`);
  }
  return candidate;
}

function inventory(
  root: string,
  selectedPlatform: Platform,
): {
  files: ExportFile[];
  metadataSha256: string;
  bundleSha256Base64Url: string;
  assetSha256Base64Url: string[];
} {
  const metadataPath = filePathWithin(root, 'metadata.json');
  let metadata: unknown;
  try {
    metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as unknown;
  } catch {
    error('metadata.json is not valid JSON.');
  }
  const parsedMetadata = metadataSchema.safeParse(metadata);
  if (!parsedMetadata.success) {
    error('Only Expo Metro metadata.json version 0 exports are supported.');
  }
  const selected = platformMetadataSchema.safeParse(
    parsedMetadata.data.fileMetadata[selectedPlatform],
  );
  if (!selected.success) {
    error(`metadata.json has no ${selectedPlatform} export.`);
  }
  const { bundle, assets } = selected.data;

  const files = new Map<string, ExportFile>();
  let bundleSha256Base64Url = '';
  const assetSha256Base64Url: string[] = [];
  const addFile = (path: string) => {
    const normalized = path.replaceAll('\\', '/');
    const filePath = filePathWithin(root, normalized);
    const bytes = readFileSync(filePath);
    const digest = createHash('sha256').update(bytes).digest();
    const exportFile = { path: normalized, size: bytes.byteLength, sha256: digest.toString('hex') };
    files.set(normalized, exportFile);
    return digest.toString('base64url');
  };
  bundleSha256Base64Url = addFile(bundle);
  for (const asset of assets) {
    assetSha256Base64Url.push(addFile(asset.path));
  }

  return {
    files: [...files.values()].sort((left, right) => left.path.localeCompare(right.path)),
    metadataSha256: sha256(readFileSync(metadataPath)),
    bundleSha256Base64Url,
    assetSha256Base64Url,
  };
}

function resolveRuntimeVersion(appRoot: string, selectedPlatform: Platform): string {
  const output = run(
    'pnpm',
    ['exec', 'expo-updates', 'runtimeversion:resolve', '--platform', selectedPlatform],
    appRoot,
    true,
  );
  let resolved: unknown;
  try {
    resolved = JSON.parse(output.trim()) as unknown;
  } catch {
    error('expo-updates runtimeversion:resolve did not return JSON.');
  }
  const parsedRuntimeVersion = runtimeVersionResultSchema.safeParse(resolved);
  if (
    !parsedRuntimeVersion.success ||
    !/^[a-f0-9]{40,64}$/u.test(parsedRuntimeVersion.data.runtimeVersion)
  ) {
    error('Resolved runtimeVersion is not a lowercase Expo fingerprint hash.');
  }
  return parsedRuntimeVersion.data.runtimeVersion;
}

function writeOutput(name: string, value: string): void {
  if (/[\r\n]/u.test(value)) {
    error(`Cannot write multiline GitHub output: ${name}.`);
  }
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    appendFileSync(outputPath, `${name}=${value}\n`, { encoding: 'utf8', mode: 0o600 });
  }
}

function writeProvenance(root: string, value: Provenance): void {
  writeFileSync(resolve(root, 'provenance.json'), `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
}

function readProvenance(root: string): Provenance {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(resolve(root, 'provenance.json'), 'utf8')) as unknown;
  } catch {
    error('provenance.json is missing or invalid.');
  }
  const result = provenanceSchema.safeParse(parsed);
  if (!result.success) {
    error('provenance.json has an unsupported schema or evidence.');
  }
  return result.data;
}

function verifyLocal(
  root: string,
  provenance: Provenance,
  selectedPlatform: Platform,
  keyid: string,
): ReturnType<typeof inventory> {
  if (provenance.platform !== selectedPlatform || provenance.keyid !== keyid) {
    error('provenance.json does not match the requested platform and keyid.');
  }
  const result = inventory(root, selectedPlatform);
  if (
    result.metadataSha256 !== provenance.metadataSha256 ||
    result.files.length !== provenance.files.length
  ) {
    error('The export metadata or file inventory does not match provenance.json.');
  }
  const recorded = new Map(provenance.files.map((file) => [file.path, file]));
  for (const file of result.files) {
    const expected = recorded.get(file.path);
    if (!expected || expected.size !== file.size || expected.sha256 !== file.sha256) {
      error(`Export bytes do not match provenance.json: ${file.path}`);
    }
  }
  return result;
}

const manifestAssetSchema = z.object({
  hash: z.string().min(1),
  url: z.string().url(),
});
const updateManifestSchema = z.object({
  id: z.string().min(1),
  runtimeVersion: z.string().min(1),
  launchAsset: manifestAssetSchema,
  assets: z.array(manifestAssetSchema),
});

function manifestUrl(
  baseUrl: string,
  selectedPlatform: Platform,
  selectedChannel: Channel,
  runtimeVersion: string,
): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    error('--public-base-url must be an absolute URL.');
  }
  if (url.protocol !== 'https:') {
    error('--public-base-url must use HTTPS.');
  }
  url.pathname = `${url.pathname.replace(/\/+$/u, '')}/releases/${PROJECT}/${selectedPlatform}/${selectedChannel}/${encodeURIComponent(runtimeVersion)}/manifest.json`;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function parseManifestPart(
  responseBody: Buffer,
  contentType: string,
): { json: Buffer; signature: string } {
  const match = /^multipart\/mixed\s*;\s*boundary=(?:"([^"]+)"|([^;\s]+))\s*$/iu.exec(contentType);
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary) {
    error(`OTA manifest content type is invalid: ${contentType || '<missing>'}`);
  }
  const opening = Buffer.from(`--${boundary}\r\n`);
  if (!responseBody.subarray(0, opening.length).equals(opening)) {
    error('OTA manifest opening boundary is invalid.');
  }
  const headersEnd = responseBody.indexOf(Buffer.from('\r\n\r\n'), opening.length);
  if (headersEnd < 0) {
    error('OTA manifest JSON part headers are missing.');
  }
  const partHeaders = responseBody
    .subarray(opening.length, headersEnd)
    .toString('utf8')
    .split('\r\n')
    .reduce<Record<string, string>>((result, line) => {
      const separator = line.indexOf(':');
      if (separator > 0) {
        result[line.slice(0, separator).toLowerCase()] = line.slice(separator + 1).trim();
      }
      return result;
    }, {});
  if (partHeaders['content-type']?.toLowerCase() !== 'application/json') {
    error('OTA manifest first part is not JSON.');
  }
  const closing = Buffer.from(`\r\n--${boundary}--\r\n`);
  const end = responseBody.indexOf(closing, headersEnd + 4);
  if (end < 0) {
    error('OTA manifest closing boundary is missing.');
  }
  const json = responseBody.subarray(headersEnd + 4, end);
  if (!json.length || !partHeaders['expo-signature']) {
    error('OTA manifest JSON or expo-signature is missing.');
  }
  return { json, signature: partHeaders['expo-signature'] };
}

function parseSignature(value: string): { bytes: Buffer; keyid: string; alg: string } {
  const match = /^sig="([^"]+)",\s*keyid="([^"]+)",\s*alg="([^"]+)"$/u.exec(value);
  if (!match) {
    error('OTA manifest expo-signature is invalid.');
  }
  const bytes = Buffer.from(match[1]!, 'base64');
  if (!bytes.length || bytes.toString('base64') !== match[1]) {
    error('OTA manifest signature is not valid base64.');
  }
  return { bytes, keyid: match[2]!, alg: match[3]! };
}

async function verifyRemote(
  certificatePath: string,
  selectedPlatform: Platform,
  selectedChannel: Channel,
  keyid: string,
  runtimeVersion: string,
  publicBaseUrl: string,
  local: ReturnType<typeof inventory>,
): Promise<NonNullable<Provenance['verification']>> {
  const url = manifestUrl(publicBaseUrl, selectedPlatform, selectedChannel, runtimeVersion);
  const response = await fetch(url, { redirect: 'error' });
  if (!response.ok) {
    error(`OTA manifest request failed with HTTP ${response.status}.`);
  }
  if (
    response.headers.get('expo-protocol-version') !== '1' ||
    response.headers.get('expo-sfv-version') !== '0'
  ) {
    error('OTA manifest response is missing Expo protocol headers.');
  }
  const encoding = response.headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') {
    error('OTA manifest response was content-encoded.');
  }
  const body = Buffer.from(await response.arrayBuffer());
  const part = parseManifestPart(body, response.headers.get('content-type') ?? '');
  const signature = parseSignature(part.signature);
  if (signature.keyid !== keyid || signature.alg !== 'rsa-v1_5-sha256') {
    error('OTA manifest signing metadata does not match key configuration.');
  }
  const certificate = new X509Certificate(readFileSync(certificatePath));
  if (!verifySignature('RSA-SHA256', part.json, certificate.publicKey, signature.bytes)) {
    error('OTA manifest signature verification failed.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(part.json.toString('utf8')) as unknown;
  } catch {
    error('OTA manifest JSON is invalid.');
  }
  const parsedManifest = updateManifestSchema.safeParse(parsed);
  if (!parsedManifest.success) {
    error('OTA manifest release shape is invalid.');
  }
  const manifest = parsedManifest.data;
  if (manifest.runtimeVersion !== runtimeVersion) {
    error('OTA manifest runtimeVersion does not match the requested tuple.');
  }
  const remoteAssets = [manifest.launchAsset, ...manifest.assets];
  const localHashes = [local.bundleSha256Base64Url, ...local.assetSha256Base64Url].sort();
  const remoteHashes = remoteAssets.map((asset) => asset.hash).sort();
  if (localHashes.join('\n') !== remoteHashes.join('\n')) {
    error('OTA manifest assets do not match the approved export bytes.');
  }
  const tuplePrefix = new URL(url).toString().replace('/manifest.json', '/assets/');
  for (const [index, asset] of remoteAssets.entries()) {
    let assetUrl: URL;
    try {
      assetUrl = new URL(asset.url);
    } catch {
      error(`OTA asset ${index} URL is invalid.`);
    }
    const hashBytes = Buffer.from(asset.hash, 'base64url');
    if (hashBytes.length !== 32 || hashBytes.toString('base64url') !== asset.hash) {
      error(`OTA asset ${index} hash is not canonical base64url SHA-256.`);
    }
    const expectedAssetUrl = `${tuplePrefix}${hashBytes.toString('hex')}`;
    if (assetUrl.toString() !== expectedAssetUrl) {
      error(`OTA asset ${index} is outside the requested tuple.`);
    }
    const assetResponse = await fetch(assetUrl, { redirect: 'error' });
    if (!assetResponse.ok) {
      error(`OTA asset ${index} request failed with HTTP ${assetResponse.status}.`);
    }
    const assetBody = Buffer.from(await assetResponse.arrayBuffer());
    if (createHash('sha256').update(assetBody).digest('base64url') !== asset.hash) {
      error(`OTA asset ${index} hash verification failed.`);
    }
  }
  return {
    status: 'verified',
    channel: selectedChannel,
    manifestUrl: url,
    manifestId: manifest.id,
    manifestSha256: sha256(body),
    assetCount: remoteAssets.length,
    verifiedAt: new Date().toISOString(),
  };
}

function verifyPreservedEvidence(
  evidence: NonNullable<Provenance['verification']>,
  selectedPlatform: Platform,
  selectedChannel: Channel,
  runtimeVersion: string,
  local: ReturnType<typeof inventory>,
): NonNullable<Provenance['verification']> {
  if (evidence.channel !== selectedChannel) {
    error(`provenance.json has no verified ${selectedChannel} evidence.`);
  }
  let url: URL;
  try {
    url = new URL(evidence.manifestUrl);
  } catch {
    error('provenance.json has an invalid verified manifest URL.');
  }
  if (url.protocol !== 'https:') {
    error('provenance.json verified manifest URL must use HTTPS.');
  }
  const expectedSuffix = `/releases/${PROJECT}/${selectedPlatform}/${selectedChannel}/${encodeURIComponent(runtimeVersion)}/manifest.json`;
  if (!url.pathname.endsWith(expectedSuffix) || url.search || url.hash) {
    error('provenance.json verified manifest URL does not match the requested tuple.');
  }
  if (evidence.assetCount !== local.files.length) {
    error('provenance.json verified asset count does not match the export inventory.');
  }
  return evidence;
}

async function verifyCommand(values: Map<string, string>, appRoot: string): Promise<void> {
  const selectedPlatform = platform(values);
  const selectedChannel = channel(values);
  const keyid = required(values, 'keyid');
  const root = resolve(required(values, 'output-dir'));
  const provenance = readProvenance(root);
  if (provenance.runtimeVersion !== required(values, 'runtime-version')) {
    error('runtimeVersion does not match provenance.json.');
  }
  const local = verifyLocal(root, provenance, selectedPlatform, keyid);
  const sourceManifestId = values.get('source-manifest-id')?.trim();
  if (selectedChannel === 'production' && !sourceManifestId) {
    error('--source-manifest-id is required for production verification.');
  }
  const verification = await verifyRemote(
    resolve(appRoot, 'certs/certificate.pem'),
    selectedPlatform,
    selectedChannel,
    keyid,
    provenance.runtimeVersion,
    required(values, 'public-base-url'),
    local,
  );
  if (selectedChannel === 'production' && sourceManifestId === verification.manifestId) {
    error('Production verification requires a new manifest ID.');
  }
  writeProvenance(root, { ...provenance, verification });
  writeOutput('runtime_version', provenance.runtimeVersion);
  writeOutput('manifest_id', verification.manifestId);
  writeOutput('manifest_url', verification.manifestUrl);
  console.log(`Verified ${selectedChannel} OTA manifest ${verification.manifestId}.`);
}

async function promoteCommand(values: Map<string, string>, appRoot: string): Promise<void> {
  const selectedPlatform = platform(values);
  const sourceChannel = required(values, 'source-channel');
  if (sourceChannel !== 'staging' && sourceChannel !== 'production') {
    error('--source-channel must be staging or production.');
  }
  const root = resolve(required(values, 'output-dir'));
  const keyid = required(values, 'keyid');
  const provenance = readProvenance(root);
  const local = verifyLocal(root, provenance, selectedPlatform, keyid);
  if (
    !provenance.verification ||
    provenance.verification.status !== 'verified' ||
    provenance.verification.channel !== sourceChannel
  ) {
    error(`provenance.json has no verified ${sourceChannel} evidence.`);
  }
  const operation = values.get('operation');
  if (operation !== 'promote' && operation !== 'recover') {
    error('--operation must be promote or recover.');
  }
  if (operation === 'promote' && sourceChannel !== 'staging') {
    error('--source-channel must be staging for promote.');
  }
  if (operation === 'recover' && sourceChannel !== 'production') {
    error('--source-channel must be production for recover.');
  }
  const source =
    operation === 'recover'
      ? verifyPreservedEvidence(
          provenance.verification,
          selectedPlatform,
          sourceChannel,
          provenance.runtimeVersion,
          local,
        )
      : await verifyRemote(
          resolve(appRoot, 'certs/certificate.pem'),
          selectedPlatform,
          sourceChannel,
          keyid,
          provenance.runtimeVersion,
          required(values, 'public-base-url'),
          local,
        );
  writeFileSync(
    resolve(root, 'promotion.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        operation,
        project: PROJECT,
        platform: selectedPlatform,
        sourceChannel,
        destinationChannel: 'production',
        runtimeVersion: provenance.runtimeVersion,
        sourceSha: provenance.sourceSha,
        sourceManifestId: source.manifestId,
        sourceManifestUrl: source.manifestUrl,
        sourceManifestSha256: source.manifestSha256,
        sourceFiles: local.files,
        preparedAt: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
    { encoding: 'utf8', mode: 0o600 },
  );
  writeOutput('runtime_version', provenance.runtimeVersion);
  writeOutput('manifest_id', source.manifestId);
  writeOutput('manifest_url', source.manifestUrl);
  console.log(`Prepared ${operation} artifact from verified ${sourceChannel} bytes.`);
}

function exportCommand(values: Map<string, string>, appRoot: string): void {
  const selectedPlatform = platform(values);
  const selectedChannel = channel(values);
  const sourceSha = required(values, 'source-sha').toLowerCase();
  const keyid = required(values, 'keyid');
  const outputDir = resolve(required(values, 'output-dir'));
  if (!/^[0-9a-f]{40}$/u.test(sourceSha)) {
    error('--source-sha must be an exact 40-character commit SHA.');
  }
  if (!/^[A-Za-z0-9._-]+$/u.test(keyid) || keyid === '.' || keyid === '..') {
    error('--keyid is not a valid signing key identifier.');
  }

  const currentSha = run('git', ['rev-parse', 'HEAD'], appRoot, true).trim().toLowerCase();
  if (currentSha !== sourceSha) {
    error(`Checked out ${currentSha}, expected approved source ${sourceSha}.`);
  }
  mkdirSync(outputDir, { recursive: true });
  if (readdirSync(outputDir, { withFileTypes: true }).length > 0) {
    error(`Output directory must be empty: ${outputDir}`);
  }

  const runtimeVersion = resolveRuntimeVersion(appRoot, selectedPlatform);
  run(
    'pnpm',
    [
      'exec',
      'expo',
      'export',
      '--clear',
      '--platform',
      selectedPlatform,
      '--output-dir',
      outputDir,
    ],
    appRoot,
  );
  const result = inventory(outputDir, selectedPlatform);
  writeProvenance(outputDir, {
    schemaVersion: 1,
    project: PROJECT,
    platform: selectedPlatform,
    channel: selectedChannel,
    keyid,
    runtimeVersion,
    sourceSha,
    metadataSha256: result.metadataSha256,
    files: result.files,
    exportedAt: new Date().toISOString(),
  });
  writeOutput('runtime_version', runtimeVersion);
  console.log(`Exported ${selectedPlatform} OTA artifact for ${PROJECT} (${runtimeVersion}).`);
}

async function main(): Promise<void> {
  const { command, values } = commandArgs(process.argv.slice(2));
  const appRoot = resolve(process.cwd());
  if (command === 'export') {
    exportCommand(values, appRoot);
  } else if (command === 'verify') {
    await verifyCommand(values, appRoot);
  } else {
    await promoteCommand(values, appRoot);
  }
}

main().catch((caught: unknown) => {
  const message = caught instanceof Error ? caught.message : 'OTA export failed.';
  console.error(`::error::${message.replace(/[\r\n]+/gu, ' ')}`);
  process.exitCode = 1;
});
