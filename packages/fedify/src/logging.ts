import { configureSync, getConfig, getConsoleSink, getJsonLinesFormatter } from '@logtape/logtape';

const inboxCategory = ['fedify', 'federation', 'inbox'];

export const configureFedifyInboxLogging = (): void => {
  if (getConfig()) {
    return;
  }

  configureSync({
    sinks: { json: getConsoleSink({ formatter: getJsonLinesFormatter() }) },
    filters: {
      sampleInfo: (record) => record.level !== 'info' || Math.random() < 0.01,
    },
    loggers: [
      { category: 'logtape', sinks: ['json'], lowestLevel: 'warning' },
      {
        category: inboxCategory,
        sinks: ['json'],
        filters: ['sampleInfo'],
        lowestLevel: 'info',
      },
    ],
  });
};
