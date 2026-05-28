import type { z } from 'zod';
import type { JobDefinition, JobHandler } from './types';

export class JobRegistry {
  readonly definitions = new Map<string, JobDefinition<unknown>>();
  readonly handlers = new Map<string, JobHandler<unknown>>();

  define<TPayload>(
    definition: Omit<JobDefinition<TPayload>, 'version'> & { version?: number },
  ): JobDefinition<TPayload> {
    const normalized = {
      ...definition,
      version: definition.version ?? 1,
    };

    if (this.definitions.has(normalized.type)) {
      throw new Error(`Job type already registered: ${normalized.type}`);
    }

    this.definitions.set(normalized.type, normalized as JobDefinition<unknown>);

    return normalized;
  }

  get(type: string) {
    return this.definitions.get(type);
  }

  registerHandler<TPayload>(definition: JobDefinition<TPayload>, handler: JobHandler<TPayload>) {
    if (!this.definitions.has(definition.type)) {
      this.definitions.set(definition.type, definition as JobDefinition<unknown>);
    }

    this.handlers.set(definition.type, handler as JobHandler<unknown>);
  }

  getHandler(type: string) {
    return this.handlers.get(type);
  }
}

export const defineJob = <TSchema extends z.ZodType>(
  definition: Omit<JobDefinition<z.infer<TSchema>>, 'payloadSchema' | 'version'> & {
    payloadSchema: TSchema;
    version?: number;
  },
) => ({
  ...definition,
  version: definition.version ?? 1,
});
