// Local-only entry. The shared application enforces admin access and the DEMO write scope.
import { app } from './index';
import type { Env } from './security';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    if (!['127.0.0.1', 'localhost'].includes(new URL(request.url).hostname))
      return Response.json(
        { error: 'Môi trường thử chỉ hoạt động trên máy local.' },
        { status: 403 },
      );
    return app.fetch(request, env, ctx);
  },
};
