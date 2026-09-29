import type { ZodType } from 'zod';
import { badRequest } from './errors';

/** Parse + validate a JSON body. Returns the schema's OUTPUT type (defaults applied). */
export async function parseBody<T>(req: Request, schema: ZodType<T, any, any>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest('Invalid JSON body');
  }
  return schema.parse(json);
}
