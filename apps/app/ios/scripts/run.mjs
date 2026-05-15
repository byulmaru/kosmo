import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

const appPath = 'build/DerivedData/Build/Products/Debug-iphoneos/Kosmo.app';
const bundleId = 'moe.kos';

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
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
run('xcrun', [
  'devicectl',
  'device',
  'process',
  'launch',
  '--device',
  selected.id,
  '--terminate-existing',
  bundleId,
]);
