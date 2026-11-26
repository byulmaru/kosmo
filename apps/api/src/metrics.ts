import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { MeterProvider } from '@opentelemetry/sdk-metrics';

export type HomeTimelineOutcome = 'success' | 'server_error';

const portValue = process.env.API_METRICS_PORT;
const port = portValue === undefined ? undefined : Number(portValue);

if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65_535)) {
  throw new Error('API_METRICS_PORT must be an integer between 1 and 65535');
}

const exporter =
  port === undefined
    ? undefined
    : new PrometheusExporter({
        endpoint: '/metrics',
        host: '0.0.0.0',
        port,
        preventServerStart: true,
        withoutScopeInfo: true,
        withoutTargetInfo: true,
      });

const meterProvider = exporter ? new MeterProvider({ readers: [exporter] }) : undefined;
const homeTimelineRequests = meterProvider
  ?.getMeter('kosmo-api')
  .createCounter('kosmo_home_timeline_requests_total', {
    description: 'Authorized home timeline GraphQL requests by server outcome',
    unit: '{request}',
  });

if (homeTimelineRequests) {
  homeTimelineRequests.add(0, { outcome: 'success' });
  homeTimelineRequests.add(0, { outcome: 'server_error' });
}

export const recordHomeTimelineOutcome = (outcome: HomeTimelineOutcome): void => {
  homeTimelineRequests?.add(1, { outcome });
};

export const startApiMetrics = (): Promise<void> => exporter?.startServer() ?? Promise.resolve();

export const closeApiMetrics = async (): Promise<void> => {
  await meterProvider?.shutdown();
};
