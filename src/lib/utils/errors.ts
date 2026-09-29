import { NextResponse, type NextRequest } from 'next/server';
import { ZodError } from 'zod';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const unauthorized = (msg = 'Unauthorized') => new ApiError(401, msg);
export const forbidden = (msg = 'Forbidden') => new ApiError(403, msg);
export const notFound = (msg = 'Not found') => new ApiError(404, msg);
export const badRequest = (msg = 'Bad request') => new ApiError(400, msg);
export const conflict = (msg = 'Conflict') => new ApiError(409, msg);

type Handler<Ctx> = (req: NextRequest, ctx: Ctx) => Promise<Response>;

/** Wrap every route handler: uniform error JSON, Zod messages, Prisma unique-violation mapping. */
export function withHandler<Ctx = unknown>(fn: Handler<Ctx>): Handler<Ctx> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err: any) {
      // Next.js control-flow signals (dynamic rendering, redirects, notFound) must pass through
      if (typeof err?.digest === 'string' && (err.digest === 'DYNAMIC_SERVER_USAGE' || err.digest.startsWith('NEXT_')))
        throw err;
      if (err instanceof ApiError)
        return NextResponse.json(
          { error: err.message, ...(err.code ? { code: err.code } : {}) },
          { status: err.status },
        );
      if (err instanceof ZodError)
        return NextResponse.json(
          { error: 'Validation failed', details: err.flatten().fieldErrors },
          { status: 400 },
        );
      if (err?.code === 'P2002')
        return NextResponse.json({ error: 'This record already exists (duplicate value)' }, { status: 409 });
      if (err?.code === 'P2003')
        return NextResponse.json(
          { error: 'This item is still used by other records and cannot be removed' },
          { status: 409 },
        );
      if (err?.code === 'P2025')
        return NextResponse.json({ error: 'Record not found' }, { status: 404 });
      console.error('[api]', err);
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
  };
}
