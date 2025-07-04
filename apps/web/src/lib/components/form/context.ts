import type { Form } from '$lib/form.svelte';
import { getContext, setContext } from 'svelte';

const FORM_CONTEXT_KEY = Symbol('superform');

export const setFormContext = <
  Input extends Record<string, unknown>,
  Output extends Record<string, unknown>,
>(
  form: Form<Input, Output>,
) => {
  setContext(FORM_CONTEXT_KEY, form);
};

export const getFormContext = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getContext<Form<any, any>>(FORM_CONTEXT_KEY);
};
