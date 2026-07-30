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
  assert.equal(config.web?.favicon, './assets/brand/brand-mark-light.png');
});
