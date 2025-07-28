import type { ZodSchema, ZodTypeDef } from 'zod';
import type { Action } from 'svelte/action';
import { z } from 'zod';
import { i18n } from './i18n.svelte';
import { stringifyPath } from '@kosmo/shared/validation';

export class FormValidationError extends Error {
  path: string | null;

  constructor({ path, message }: { path?: string | undefined | null; message: string }) {
    super(message);
    this.path = path ? path.split('input.', 2)[1] : null;
  }
}

type CreateFormParams<
  Input extends Record<string, unknown>,
  Output extends Record<string, unknown>,
> = {
  schema: ZodSchema<Output, ZodTypeDef, Input>;
  onSubmit?: (data: z.output<ZodSchema<Output, ZodTypeDef, Input>>) => Promise<void>;
  onError?: (error: Error) => void;
  useFormAction?: boolean;
};

export const createForm = <
  Input extends Record<string, unknown>,
  Output extends Record<string, unknown>,
>({
  schema,
  onSubmit,
  onError,
}: CreateFormParams<Input, Output>) => {
  const action: Action<HTMLFormElement> = (node) => {
    let submitted = false;

    $effect(() => {
      const parseFormData = () => {
        const formData = new FormData(node);
        const parsed = schema.safeParse(Object.fromEntries(formData));
        const inputIssues: Record<string, string[]> = {};

        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            const name = stringifyPath(issue.path);
            inputIssues[name] ??= [];
            inputIssues[name].push(issue.message);
          }
        }

        for (const inputNode of node.querySelectorAll<
          HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >('input, select, textarea')) {
          const name = inputNode.name;

          inputNode.setCustomValidity(
            inputIssues[name] ? inputIssues[name].map((error) => i18n(error)).join('\n') : '',
          );
        }

        node.reportValidity();

        return parsed.success ? parsed.data : false;
      };

      const handleSubmit = (event: Event) => {
        submitted = true;
        const parsed = parseFormData();
        event.preventDefault();

        if (parsed) {
          const submitButtonNode = node.querySelector('button[type="submit"]');
          if (submitButtonNode instanceof HTMLButtonElement) {
            submitButtonNode.setAttribute('aria-busy', 'true');
            submitButtonNode.disabled = true;
          }

          if (onSubmit) {
            onSubmit(parsed)
              .catch((error) => {
                if (error instanceof FormValidationError) {
                  const inputNode = node.querySelector(`[name="${error.path}"]`);
                  if (
                    inputNode instanceof HTMLInputElement ||
                    inputNode instanceof HTMLSelectElement ||
                    inputNode instanceof HTMLTextAreaElement
                  ) {
                    inputNode.setCustomValidity(i18n(error.message));
                    inputNode.reportValidity();
                    return;
                  }
                }

                if (onError) {
                  onError(error);
                } else {
                  throw error;
                }
              })
              .finally(() => {
                if (submitButtonNode instanceof HTMLButtonElement) {
                  submitButtonNode.removeAttribute('aria-busy');
                  submitButtonNode.disabled = false;
                }
              });
          }
        }
      };

      const handleInput = (event: Event) => {
        if (submitted) {
          parseFormData();
        }
      };

      node.addEventListener('submit', handleSubmit);
      node.addEventListener('input', handleInput, { capture: true });

      return () => {
        node.removeEventListener('submit', handleSubmit);
        node.removeEventListener('input', handleInput, { capture: true });
      };
    });
  };

  return {
    enhance: action,
  };
};

export type Form<
  Input extends Record<string, unknown>,
  Output extends Record<string, unknown>,
> = ReturnType<typeof createForm<Input, Output>>;
