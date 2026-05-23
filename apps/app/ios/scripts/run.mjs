import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

const deviceAppPath = 'build/DerivedData/Build/Products/Debug-iphoneos/Kosmo.app';
const simulatorAppPath = 'build/DerivedData/Build/Products/Debug-iphonesimulator/Kosmo.app';
const bundleId = 'moe.kos';
const debug = process.argv.includes('--debug');

const run = (command, args) => {
  const result = spawnSync(command, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const readJSONStdout = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return JSON.parse(result.stdout);
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

const readPhysicalDevices = () => {
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
        type: 'device',
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

const readSimulators = () => {
  const data = readJSONStdout('xcrun', ['simctl', 'list', 'devices', 'available', '--json']);

  return Object.entries(data.devices ?? {}).flatMap(([runtime, devices]) =>
    devices
      .filter((device) => device.isAvailable)
      .filter((device) => device.deviceTypeIdentifier?.includes('iPhone'))
      .map((device) => ({
        type: 'simulator',
        id: device.udid,
        name: device.name,
        model: runtime.replace('com.apple.CoreSimulator.SimRuntime.', '').replaceAll('-', ' '),
        state: device.state,
      })),
  );
};

const buildApp = (target) => {
  run('infisical', ['run', '--', 'node', 'scripts/generate-info-plist.mjs']);
  run('infisical', [
    'run',
    '--',
    'xcodebuild',
    '-project',
    'Kosmo.xcodeproj',
    '-scheme',
    'Kosmo',
    '-configuration',
    'Debug',
    '-sdk',
    target.type === 'simulator' ? 'iphonesimulator' : 'iphoneos',
    '-destination',
    target.type === 'simulator' ? `platform=iOS Simulator,id=${target.id}` : 'generic/platform=iOS',
    '-derivedDataPath',
    'build/DerivedData',
    'INFOPLIST_FILE=build/Info.plist',
    '-allowProvisioningUpdates',
    'build',
  ]);
};

const ensureSimulatorBooted = (simulator) => {
  if (simulator.state !== 'Booted') {
    run('xcrun', ['simctl', 'boot', simulator.id]);
    run('xcrun', ['simctl', 'bootstatus', simulator.id, '-b']);
  }
};

const attachSimulatorDebugger = (simulator, pid) => {
  const executablePath = join(simulatorAppPath, 'Kosmo');

  console.log(`Attaching LLDB to ${bundleId} on ${simulator.name} (pid ${pid}).`);
  run('xcrun', [
    'lldb',
    executablePath,
    '-o',
    'platform select ios-simulator',
    '-o',
    `process attach -p ${pid}`,
    '-o',
    'continue',
  ]);
};

const launchSimulator = (simulator) => {
  ensureSimulatorBooted(simulator);
  run('xcrun', ['simctl', 'install', simulator.id, simulatorAppPath]);

  if (debug) {
    const result = spawnSync(
      'xcrun',
      [
        'simctl',
        'launch',
        '--wait-for-debugger',
        '--terminate-running-process',
        simulator.id,
        bundleId,
      ],
      { encoding: 'utf8', stdio: ['inherit', 'pipe', 'inherit'] },
    );
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }

    process.stdout.write(result.stdout);
    const pid = Number(result.stdout.match(/: (\d+)$/m)?.[1]);
    if (!pid) {
      console.error('Could not find launched simulator process ID.');
      process.exit(1);
    }

    attachSimulatorDebugger(simulator, pid);
  } else {
    run('xcrun', [
      'simctl',
      'launch',
      '--terminate-running-process',
      '--console',
      simulator.id,
      bundleId,
    ]);
  }
};

const physicalDevices = await readPhysicalDevices();
const simulators = readSimulators();
const targets = [...physicalDevices, ...simulators];

if (targets.length === 0) {
  console.error('No physical iOS devices or iPhone simulators found.');
  process.exit(1);
}

console.log('Select an iOS device or simulator:');
targets.forEach((target, index) => {
  const label = target.type === 'simulator' ? 'Simulator' : 'Device';
  console.log(`${index + 1}. ${label}: ${target.name} (${target.model}, ${target.state})`);
});

const rl = createInterface({ input, output });
const answer = await rl.question('Device number: ');
rl.close();

const selected = targets[Number(answer.trim()) - 1];
if (!selected) {
  console.error('Invalid iOS target selection.');
  process.exit(1);
}

buildApp(selected);

if (selected.type === 'simulator') {
  launchSimulator(selected);
  process.exit(0);
}

run('xcrun', ['devicectl', 'device', 'install', 'app', '--device', selected.id, deviceAppPath]);

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

  const executablePath = join(deviceAppPath, 'Kosmo');

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
