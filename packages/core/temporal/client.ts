import { Client, Connection } from '@temporalio/client';

export const KOSMO_TASK_QUEUE = 'kosmo';

let client: Client | undefined;

export const temporalClient: Pick<Client, 'workflow'> = {
  get workflow() {
    if (!client) {
      const address = process.env.TEMPORAL_ADDRESS?.trim();
      const namespace = process.env.TEMPORAL_NAMESPACE?.trim();
      if (!address) {
        throw new Error('TEMPORAL_ADDRESS is required');
      }
      if (!namespace) {
        throw new Error('TEMPORAL_NAMESPACE is required');
      }
      client = new Client({ connection: Connection.lazy({ address }), namespace });
    }
    return client.workflow;
  },
};
