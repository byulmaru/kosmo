import { configureSync, getConfig, getConsoleSink, getJsonLinesFormatter } from '@logtape/logtape';
import { getSentrySink } from '@logtape/sentry';
import type { SentryNamespace } from '@logtape/sentry';

const inboxCategory = ['fedify', 'federation', 'inbox'];

export const configureFedifyInboxLogging = (sentry: SentryNamespace): void => {
  if (getConfig()) {
    return;
  }

  configureSync({
    sinks: {
      json: getConsoleSink({ formatter: getJsonLinesFormatter() }),
      sentry: getSentrySink({ sentry }),
    },
    filters: {
      sampleInfo: (record) => record.level !== 'info' || Math.random() < 0.01,
    },
    loggers: [
      { category: 'logtape', sinks: ['json'], lowestLevel: 'warning' },
      {
        category: inboxCategory,
        sinks: ['json', 'sentry'],
        filters: ['sampleInfo'],
        lowestLevel: 'info',
      },
    ],
  });
};
