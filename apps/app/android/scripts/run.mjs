import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface } from 'node:readline/promises';

const apkPath = 'app/build/outputs/apk/debug/app-debug.apk';
const packageName = 'moe.kos';
const activityName = 'moe.kos.app.MainActivity';
const debug = process.argv.includes('--debug');
const androidHome = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT;
const defaultAndroidHome = join(process.env.HOME ?? '', 'Library/Android/sdk');

const resolveCommand = (command, sdkRelativePath) => {
  const candidates = [
    androidHome && join(androidHome, sdkRelativePath),
    join(defaultAndroidHome, sdkRelativePath),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return command;
};

const adb = resolveCommand('adb', 'platform-tools/adb');
const emulator = resolveCommand('emulator', 'emulator/emulator');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const run = (command, args, options) => {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return result;
};

const readDevices = () => {
  const result = spawnSync(adb, ['devices', '-l'], { encoding: 'utf8' });
  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return result.stdout
    .trim()
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id, state, ...properties] = line.split(/\s+/);
      const propertyMap = Object.fromEntries(
        properties.map((property) => {
          const [key, ...value] = property.split(':');
          return [key, value.join(':')];
        }),
      );

      return {
        id,
        model: propertyMap.model ?? propertyMap.product ?? 'Unknown',
        state,
      };
    })
    .filter((device) => device.state === 'device');
};

const readEmulators = () => {
  const result = spawnSync(emulator, ['-list-avds'], { encoding: 'utf8' });
  if (result.status !== 0) {
    return [];
  }

  return result.stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
};

const waitForBootedEmulator = async (knownDeviceIds) => {
  const deadline = Date.now() + 180_000;

  while (Date.now() < deadline) {
    const device = readDevices().find(
      (candidate) => candidate.id.startsWith('emulator-') && !knownDeviceIds.has(candidate.id),
    );

    if (device) {
      run(adb, ['-s', device.id, 'wait-for-device']);

      while (Date.now() < deadline) {
        const result = spawnSync(adb, ['-s', device.id, 'shell', 'getprop', 'sys.boot_completed'], {
          encoding: 'utf8',
        });

        if (result.stdout.trim() === '1') {
          return device.id;
        }

        await sleep(2_000);
      }
    }

    await sleep(2_000);
  }

  console.error('Timed out waiting for Android emulator to boot.');
  process.exit(1);
};

const devices = readDevices();
const emulators = readEmulators();
const options = [
  ...devices.map((device) => ({ type: 'device', device })),
  ...emulators.map((name) => ({ type: 'emulator', name })),
];

if (options.length === 0) {
  console.error('No connected Android devices or installed Android emulators found.');
  process.exit(1);
}

console.log('Select an Android device or emulator:');
options.forEach((option, index) => {
  if (option.type === 'device') {
    console.log(`${index + 1}. ${option.device.id} (${option.device.model})`);
  } else {
    console.log(`${index + 1}. Start emulator: ${option.name}`);
  }
});

const rl = createInterface({ input, output });
const answer = await rl.question('Device number: ');
rl.close();

const selected = options[Number(answer.trim()) - 1];
if (!selected) {
  console.error('Invalid Android target selection.');
  process.exit(1);
}

let selectedDeviceId;
if (selected.type === 'device') {
  selectedDeviceId = selected.device.id;
} else {
  const knownDeviceIds = new Set(devices.map((device) => device.id));
  const emulatorProcess = spawn(emulator, ['-avd', selected.name], {
    detached: true,
    stdio: 'ignore',
  });
  emulatorProcess.unref();

  selectedDeviceId = await waitForBootedEmulator(knownDeviceIds);
}

run('pnpm', ['run', 'build']);
run(adb, ['-s', selectedDeviceId, 'install', '-r', apkPath]);

const startArgs = [
  '-s',
  selectedDeviceId,
  'shell',
  'am',
  'start',
  '-n',
  `${packageName}/${activityName}`,
];

if (debug) {
  startArgs.splice(5, 0, '-D');
}

run(adb, startArgs);
