import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { createAllowListAttributesProcessor, MeterProvider } from '@opentelemetry/sdk-metrics';

const allowedAttributes = [
  'activitypub.circuit_breaker.state',
  'activitypub.collection.kind',
  'activitypub.collection.result',
  'activitypub.delivery.success',
  'activitypub.lookup.kind',
  'activitypub.lookup.result',
  'activitypub.processing.result',
  'activitypub.signature.key_fetch.result',
  'activitypub.signature.kind',
  'activitypub.signature.result',
  'fedify.federation.instance_id',
  'fedify.queue.backend',
  'fedify.queue.depth.state',
  'fedify.queue.role',
  'fedify.queue.task.result',
  'fedify.route.template',
  'http.request.method',
  'http.response.status_code',
  'webfinger.handle.result',
];

const portValue = process.env.METRICS_PORT;
const port = portValue === undefined ? undefined : Number(portValue);

if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65_535)) {
  throw new Error('METRICS_PORT must be an integer between 1 and 65535');
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

export const fedifyMeterProvider = exporter
  ? new MeterProvider({
      readers: [exporter],
      views: [
        {
          instrumentName: '*',
          attributesProcessors: [createAllowListAttributesProcessor(allowedAttributes)],
        },
      ],
    })
  : undefined;

export const startFedifyMetrics = (): Promise<void> => exporter?.startServer() ?? Promise.resolve();

export const closeFedifyMetrics = async (): Promise<void> => {
  await fedifyMeterProvider?.shutdown();
};
