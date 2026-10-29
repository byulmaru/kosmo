import { getNativeDeploymentChannel } from './nativeChannel';

export type DeploymentChannel = 'dev' | 'prod';

export type PublicWebPushConfig = {
  apiKey: string;
  appId: string;
  messagingSenderId: string;
  projectId: string;
  vapidKey: string;
};

export type PublicConfig = {
  apiOrigin: string;
  channel: DeploymentChannel;
  oidcClientId: string;
  oidcIssuer: string;
  posthogHost: string | undefined;
  posthogKey: string | undefined;
  sentryDsn: string;
  webPush?: PublicWebPushConfig;
  webOrigin: string;
};

const commonPublicConfig = {
  oidcClientId: '01KQM0S7HGTVJNZA6TTTK8T5NM',
  oidcIssuer: 'https://id.byulmaru.co',
  sentryDsn:
    'https://07f92d1f243d540b91a3edb9e22eafa2@o4507210007117824.ingest.us.sentry.io/4507210010329088',
} as const;

const publicConfigByChannel: Record<DeploymentChannel, PublicConfig> = {
  dev: {
    ...commonPublicConfig,
    apiOrigin: 'https://dev-api.kos.moe',
    channel: 'dev',
    posthogHost: undefined,
    posthogKey: undefined,
    webOrigin: 'https://dev.kos.moe',
  },
  prod: {
    ...commonPublicConfig,
    apiOrigin: 'https://api.kos.moe',
    channel: 'prod',
    posthogHost: 'https://eu.i.posthog.com',
    posthogKey: 'phc_wtHL2JZViyDBizGfTYXqjHwejEwJiEwHoEzPZ3DtUmDS',
    webOrigin: 'https://kos.moe',
  },
};

export function getPublicConfig<Key extends keyof PublicConfig>(key: Key): PublicConfig[Key] {
  return publicConfigByChannel[getCurrentChannel()][key];
}

function isNativeDevelopment(): boolean {
  return (globalThis as typeof globalThis & { __DEV__?: unknown }).__DEV__ === true;
}

function getCurrentChannel(): DeploymentChannel {
  const globals = globalThis as typeof globalThis & { __KOSMO_CHANNEL__?: unknown };

  if (typeof document !== 'undefined') {
    const channel = globals.__KOSMO_CHANNEL__;
    if (channel !== 'dev' && channel !== 'prod') {
      throw new Error('A valid deployment channel (dev or prod) is required.');
    }

    return channel;
  }

  const nativeChannel = getNativeDeploymentChannel();
  if (nativeChannel !== null) {
    return nativeChannel;
  }

  return isNativeDevelopment() ? 'dev' : 'prod';
}
