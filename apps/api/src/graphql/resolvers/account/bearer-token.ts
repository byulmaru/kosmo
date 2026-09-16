import { PermissionDeniedError } from '@kosmo/core/error';

export const getAccountBearerToken = (authorization: string | undefined) => {
  if (authorization === undefined) {
    throw new PermissionDeniedError();
  }

  const token = authorization.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) {
    throw new PermissionDeniedError('Authorization header must use Bearer');
  }

  return token;
};
