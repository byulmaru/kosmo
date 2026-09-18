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
let PUSH_PROMPT_COMPLETE_KEY: string;
let deletePushInstallationId: () => Promise<void>;
let markPushPromptComplete: () => Promise<void>;
let readPushInstallationId: () => Promise<string | null>;
let readPushPromptComplete: () => Promise<boolean>;
let writePushInstallationId: (id: string) => Promise<void>;

before(async () => {
  const storageModule = await import('./pushStorage');
  PUSH_INSTALLATION_ID_KEY = storageModule.PUSH_INSTALLATION_ID_KEY;
  PUSH_PROMPT_COMPLETE_KEY = storageModule.PUSH_PROMPT_COMPLETE_KEY;
  deletePushInstallationId = storageModule.deletePushInstallationId;
  markPushPromptComplete = storageModule.markPushPromptComplete;
  readPushInstallationId = storageModule.readPushInstallationId;
  readPushPromptComplete = storageModule.readPushPromptComplete;
  writePushInstallationId = storageModule.writePushInstallationId;
});

beforeEach(() => values.clear());

describe('native push local storage', () => {
  it('records one installation-local prompt completion marker', async () => {
    assert.equal(await readPushPromptComplete(), false);

    await markPushPromptComplete();

    assert.equal(await readPushPromptComplete(), true);
    assert.deepEqual([...values.keys()], [PUSH_PROMPT_COMPLETE_KEY]);
  });

  it('stores only the server-issued installation ID beside the prompt marker', async () => {
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
});
