import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const unauthorized = (msg = 'Unauthorized') => new ApiError(401, msg);
export const forbidden = (msg = 'Forbidden') => new ApiError(403, msg);
export const notFound = (msg = 'Not found') => new ApiError(404, msg);
export const badRequest = (msg = 'Bad request') => new ApiError(400, msg);
export const conflict = (msg = 'Conflict') => new ApiError(409, msg);

type Handler<Ctx> = (req: Request, ctx: Ctx) => Promise<Response>;

/** Wrap every route handler: uniform error JSON, Zod messages, Prisma unique-violation mapping. */
export function withHandler<Ctx = unknown>(fn: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err: any) {
      if (err instanceof ApiError)
        return NextResponse.json({ error: err.message }, { status: err.status });
      if (err instanceof ZodError)
        return NextResponse.json(
          { error: 'Validation failed', details: err.flatten().fieldErrors },
          { status: 400 },
        );
      if (err?.code === 'P2002')
        return NextResponse.json({ error: 'Duplicate record' }, { status: 409 });
      console.error('[api]', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
