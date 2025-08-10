export const dev = process.env.NODE_ENV !== 'production';
export const stack = process.env.PUBLIC_PULUMI_STACK ?? 'local';
