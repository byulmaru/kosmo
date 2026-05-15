import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

const appPath = 'build/DerivedData/Build/Products/Debug-iphoneos/Kosmo.app';
const executablePath = join(appPath, 'Kosmo');
const bundleId = 'moe.kos';
const debug = process.argv.includes('--debug');

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const runJSON = (command, argsForJSON) => {
  const dir = mkdtempSync(join(tmpdir(), 'kosmo-command-'));
  const jsonPath = join(dir, 'result.json');

  try {
    const result = spawnSync(command, argsForJSON(jsonPath), { stdio: 'inherit' });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }
    return JSON.parse(readFileSync(jsonPath, 'utf8'));
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
};

const findProcessID = (value) => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (['pid', 'processIdentifier', 'processID'].includes(key) && typeof nested === 'number') {
      return nested;
    }
    const pid = findProcessID(nested);
    if (pid) {
      return pid;
    }
  }

  return undefined;
};

const readDevices = () => {
  const dir = mkdtempSync(join(tmpdir(), 'kosmo-devices-'));
  const jsonPath = join(dir, 'devices.json');

  try {
    run('xcrun', ['devicectl', 'list', 'devices', '--json-output', jsonPath]);
    const data = JSON.parse(readFileSync(jsonPath, 'utf8'));
    return data.result.devices
      .filter((device) => device.hardwareProperties?.platform === 'iOS')
      .filter((device) => device.hardwareProperties?.reality === 'physical')
      .filter((device) => ['iPhone', 'iPad'].includes(device.hardwareProperties?.deviceType))
      .map((device) => ({
        id: device.identifier,
        name: device.deviceProperties?.name ?? device.identifier,
        model:
          device.hardwareProperties?.marketingName ??
          device.hardwareProperties?.productType ??
          'Unknown',
        state:
          device.connectionProperties?.tunnelState ??
          device.connectionProperties?.pairingState ??
          'unknown',
      }));
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
};

const devices = await readDevices();

if (devices.length === 0) {
  console.error('No physical iOS devices found.');
  process.exit(1);
}

console.log('Select an iOS device:');
devices.forEach((device, index) => {
  console.log(`${index + 1}. ${device.name} (${device.model}, ${device.state})`);
});

const rl = createInterface({ input, output });
const answer = await rl.question('Device number: ');
rl.close();

const selected = devices[Number(answer.trim()) - 1];
if (!selected) {
  console.error('Invalid device selection.');
  process.exit(1);
}

run('pnpm', ['run', 'build']);
run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', selected.id, appPath]);

if (debug) {
  const launchResult = runJSON('xcrun', (jsonPath) => [
    'devicectl',
    'device',
    'process',
    'launch',
    '--device',
    selected.id,
    '--terminate-existing',
    '--start-stopped',
    '--json-output',
    jsonPath,
    bundleId,
  ]);
  const pid = findProcessID(launchResult);

  if (!pid) {
    console.error('Could not find launched process ID.');
    process.exit(1);
  }

  console.log(`Attaching LLDB to ${bundleId} on ${selected.name} (pid ${pid}).`);
  run('xcrun', [
    'lldb',
    executablePath,
    '-o',
    `device select ${selected.id}`,
    '-o',
    `device process attach -p ${pid}`,
    '-o',
    'continue',
  ]);
} else {
  run('xcrun', [
    'devicectl',
    'device',
    'process',
    'launch',
    '--device',
    selected.id,
    '--terminate-existing',
    '--console',
    bundleId,
  ]);
}
