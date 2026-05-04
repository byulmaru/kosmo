import type { Context as HonoContext } from 'hono';

type DefaultContext = {
  ip: string;
};

export type SessionContext = {
  session: {
    id: string;
  };
};

export type Context = DefaultContext & Partial<SessionContext>;
export type UserContext = Context & { c: ServerContext };

export type Env = object;

export type ServerContext = HonoContext<Env>;
