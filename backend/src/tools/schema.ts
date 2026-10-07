import { z } from 'zod';

export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  return parse(schema, true);
}

function parse(schema: z.ZodTypeAny, root = false): any {
  if (schema instanceof z.ZodOptional) {
    return { ...parse(schema._def.innerType, false), ...(root ? {} : {}) };
  }
  if (schema instanceof z.ZodDefault) {
    return { ...parse(schema._def.innerType, false), default: schema._def.defaultValue?.() };
  }
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const [key, sub] of Object.entries(shape)) {
      properties[key] = parse(sub, false);
      if (!(sub instanceof z.ZodOptional) && !(sub instanceof z.ZodDefault)) {
        required.push(key);
      }
    }
    return { type: 'object', properties, required };
  }
  if (schema instanceof z.ZodArray) {
    return { type: 'array', items: parse(schema._def.type, false) };
  }
  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema._def.values as string[] };
  }
  if (schema instanceof z.ZodLiteral) {
    return { type: typeof schema._def.value, enum: [schema._def.value] };
  }
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodRecord) {
    // Gemini (OpenAPI subset) rechaza additionalProperties; un object sin
    // properties fijas ya valida cualquier input como objeto libre.
    return { type: 'object' };
  }
  if (schema instanceof z.ZodNull) return { type: 'null' };
  if (schema instanceof z.ZodAny || schema instanceof z.ZodUnknown) return {};
  return {};
}

export function safeParseArgs<T extends z.ZodTypeAny>(schema: T, args: Record<string, unknown>): { ok: true; data: z.infer<T> } | { ok: false; error: string } {
  const result = schema.safeParse(args ?? {});
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
}
