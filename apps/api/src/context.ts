import type { Context as HonoContext } from 'hono';

type DefaultContext = {
  ip: string;
};

export type OAuthContext = {
  oauth: {
    tokenId: string;
    accountId: string;
    applicationId: string;
    profileId?: string;
    scopes: string[];
  };
};

export type SessionContext = {
  session: {
    id: string;
  };
};

export type Context = DefaultContext & Partial<OAuthContext> & Partial<SessionContext>;
export type UserContext = Context & { c: ServerContext };

export type Env = {
  Variables: { context: Context };
};

export type ServerContext = HonoContext<Env>;
