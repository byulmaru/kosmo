import assert from 'node:assert/strict';
import test from 'node:test';
import config from '../app.config';

test('Expo resolves the approved platform-specific icons', () => {
  assert.equal(config.icon, './assets/brand/app-icon-ios-light.png');
  assert.equal(config.ios?.icon, './assets/brand/app-icon-ios-light.png');
  assert.equal(
    config.android?.adaptiveIcon?.foregroundImage,
    './assets/brand/app-icon-android-foreground.png',
  );
  assert.equal(config.android?.adaptiveIcon?.backgroundColor, '#FEFEFE');
  assert.equal(config.web?.favicon, './public/favicon-32x32.png');
});

test('Native OTA uses one endpoint and starts with the prod channel header', () => {
  assert.equal(config.updates?.url, 'https://expo-ota.byulmaru.co/releases/kosmo-native');
  assert.deepEqual(config.updates?.requestHeaders, { 'expo-channel-name': 'prod' });
  assert.deepEqual(config.runtimeVersion, { policy: 'fingerprint' });
});
