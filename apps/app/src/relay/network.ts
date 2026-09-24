import { getApiOrigin, getPublicWebOrigin } from '@/config/origin';
import { RelayTransportError } from './transportError';
import type { GraphQLResponse, RequestParameters, UploadableMap, Variables } from 'relay-runtime';

type NativeUploadable = { readonly name: string; readonly type: string; readonly uri: string };
type RelayUploadables = UploadableMap | Record<string, Blob | NativeUploadable>;

function isNativeRuntime(): boolean {
  return globalThis.navigator?.product === 'ReactNative';
}

export async function executeGraphQLRequest(
  request: RequestParameters,
  variables: Variables,
  token: string | null,
  fetchImplementation: typeof fetch = fetch,
  uploadables?: RelayUploadables | null,
): Promise<GraphQLResponse> {
  if (!request.text) {
    throw new Error(`Relay operation ${request.name} has no query text.`);
  }

  const native = isNativeRuntime();
  const origin = native ? getApiOrigin() : getPublicWebOrigin();
  const requestBody =
    uploadables && Object.keys(uploadables).length > 0
      ? createMultipartBody(request, variables, uploadables)
      : JSON.stringify({
          operationName: request.name,
          query: request.text,
          variables,
        });
  const responsePromise = fetchImplementation(`${origin}/graphql`, {
    method: 'POST',
    credentials: native ? 'omit' : 'include',
    headers: {
      accept: 'application/json',
      ...(uploadables && Object.keys(uploadables).length > 0
        ? {}
        : { 'content-type': 'application/json' }),
      ...(native && token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: requestBody,
  });
  const response = await responsePromise.catch((cause) => {
    throw new RelayTransportError(cause);
  });

  const body = (await response.json().catch(() => null)) as GraphQLResponse | null;

  if (!response.ok) {
    const message =
      body && 'errors' in body
        ? body.errors
            ?.map((error) => error.message)
            .filter(Boolean)
            .join('\n')
        : undefined;
    throw new Error(message || `GraphQL request failed with HTTP ${response.status}.`);
  }

  if (!body) {
    throw new Error('GraphQL response was not JSON.');
  }

  return body;
}

function createMultipartBody(
  request: RequestParameters,
  variables: Variables,
  uploadables: RelayUploadables,
): FormData {
  const multipartVariables = JSON.parse(JSON.stringify(variables)) as Variables;
  const map: Record<string, string[]> = {};
  const formData = new FormData();
  const files: [string, Blob | NativeUploadable][] = [];

  Object.entries(uploadables).forEach(([uploadablePath, uploadable], index) => {
    const variablePath = uploadablePath.startsWith('variables.')
      ? uploadablePath.slice('variables.'.length)
      : uploadablePath;
    setVariablePath(multipartVariables, variablePath, null);
    map[String(index)] = [`variables.${variablePath}`];
    files.push([String(index), uploadable]);
  });

  formData.append(
    'operations',
    JSON.stringify({
      operationName: request.name,
      query: request.text,
      variables: multipartVariables,
    }),
  );
  formData.append('map', JSON.stringify(map));
  for (const [key, uploadable] of files) {
    if (uploadable instanceof Blob) {
      formData.append(key, uploadable);
    } else {
      formData.append(key, uploadable as unknown as Blob);
    }
  }
  return formData;
}

function setVariablePath(variables: Variables, path: string, value: null): void {
  const segments = path.split('.');
  const last = segments.pop();
  if (!last || segments.length === 0) {
    return;
  }

  let current: unknown = variables;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') {
      return;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  if (current && typeof current === 'object') {
    (current as Record<string, unknown>)[last] = value;
  }
}

export function formatGraphQLError(error: unknown): string {
  return error instanceof Error ? error.message : '요청을 처리하지 못했습니다.';
}
