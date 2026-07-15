import type { ZodSchema } from 'zod';
import { badRequest } from './errors';

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw badRequest('Invalid JSON body');
  }
  return schema.parse(json);
}
