import assert from 'node:assert/strict';
import { before, beforeEach, describe, it, mock } from 'node:test';

const values = new Map<string, string>();
const storage = {
  getItem: async (key: string) => values.get(key) ?? null,
  removeItem: async (key: string) => {
    values.delete(key);
  },
  setItem: async (key: string, value: string) => {
    values.set(key, value);
  },
};

mock.module('@react-native-async-storage/async-storage', {
  exports: { default: storage },
} as unknown as Parameters<typeof mock.module>[1]);

let PUSH_INSTALLATION_ID_KEY: string;
let LAST_NOTIFIED_OTA_UPDATE_ID_KEY: string;
let deletePushInstallationId: () => Promise<void>;
let readLastNotifiedOtaUpdateId: () => Promise<string | null>;
let readPushInstallationId: () => Promise<string | null>;
let writeLastNotifiedOtaUpdateId: (updateId: string) => Promise<void>;
let writePushInstallationId: (id: string) => Promise<void>;

before(async () => {
  const storageModule = await import('./pushStorage');
  LAST_NOTIFIED_OTA_UPDATE_ID_KEY = storageModule.LAST_NOTIFIED_OTA_UPDATE_ID_KEY;
  PUSH_INSTALLATION_ID_KEY = storageModule.PUSH_INSTALLATION_ID_KEY;
  deletePushInstallationId = storageModule.deletePushInstallationId;
  readLastNotifiedOtaUpdateId = storageModule.readLastNotifiedOtaUpdateId;
  readPushInstallationId = storageModule.readPushInstallationId;
  writeLastNotifiedOtaUpdateId = storageModule.writeLastNotifiedOtaUpdateId;
  writePushInstallationId = storageModule.writePushInstallationId;
});

beforeEach(() => values.clear());

describe('native push local storage', () => {
  it('stores the server-issued installation ID', async () => {
    await writePushInstallationId('UGVyc2lzdGVudEluc3RhbGxhdGlvbjox');

    assert.equal(await readPushInstallationId(), 'UGVyc2lzdGVudEluc3RhbGxhdGlvbjox');
    assert.deepEqual([...values.keys()], [PUSH_INSTALLATION_ID_KEY]);
  });

  it('deletes the local installation ID only after server unregister succeeds', async () => {
    await writePushInstallationId('UGVyc2lzdGVudEluc3RhbGxhdGlvbjox');
    assert.equal(await readPushInstallationId(), 'UGVyc2lzdGVudEluc3RhbGxhdGlvbjox');

    await deletePushInstallationId();

    assert.equal(await readPushInstallationId(), null);
    assert.deepEqual([...values.keys()], []);
  });

  it('stores the last OTA update notice ID independently from the push installation ID', async () => {
    await writePushInstallationId('installation-1');
    await writeLastNotifiedOtaUpdateId('ota-update-1');

    assert.equal(await readPushInstallationId(), 'installation-1');
    assert.equal(await readLastNotifiedOtaUpdateId(), 'ota-update-1');
    assert.deepEqual(
      [...values.keys()].sort(),
      [LAST_NOTIFIED_OTA_UPDATE_ID_KEY, PUSH_INSTALLATION_ID_KEY].sort(),
    );
  });
});
