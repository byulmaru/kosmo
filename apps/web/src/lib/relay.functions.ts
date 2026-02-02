import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';

export const fetchQuery = createServerFn({ method: 'POST' })
  .inputValidator((input: { query: string | null; variables: Record<string, unknown> }) => input)
  .handler(async ({ data }) => {
    const accessToken = getCookie('accessToken');

    const resp = await fetch('http://localhost:8260/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ query: data.query, variables: data.variables }),
    });

    if (!resp.ok) {
      throw new Error('Response failed.');
    }

    return await resp.json();
  });
