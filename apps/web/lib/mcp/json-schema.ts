// ---------------------------------------------------------------------------
// Minimal Zod → JSON Schema converter
// ---------------------------------------------------------------------------
// We need JSON Schema for two MCP-spec methods: `tools/list` (returns each
// tool's `inputSchema`) and the public manifest endpoint. Rather than
// pulling a heavy zod-to-json-schema dependency, we cover only the subset
// the codebase actually uses.
//
// Supported: object, string, number, integer, boolean, array, enum, union
// of literals, optional, default, nullable.
// ---------------------------------------------------------------------------

import { z, ZodFirstPartyTypeKind } from 'zod';

type JsonSchema = Record<string, unknown>;

export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchema {
  const def = (schema as unknown as { _def: { typeName?: string } })._def;
  const typeName = def?.typeName as string | undefined;

  switch (typeName) {
    case ZodFirstPartyTypeKind.ZodObject: {
      const shape = (schema as unknown as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const [key, value] of Object.entries(shape)) {
        const inner = value as z.ZodTypeAny;
        properties[key] = zodToJsonSchema(inner);
        const innerDef = (inner as unknown as { _def: { typeName?: string } })._def;
        const innerType = innerDef?.typeName;
        if (
          innerType !== ZodFirstPartyTypeKind.ZodOptional &&
          innerType !== ZodFirstPartyTypeKind.ZodDefault &&
          innerType !== ZodFirstPartyTypeKind.ZodNullable
        ) {
          required.push(key);
        }
      }
      const result: JsonSchema = { type: 'object', properties };
      if (required.length > 0) result.required = required;
      return result;
    }
    case ZodFirstPartyTypeKind.ZodString: {
      const s: JsonSchema = { type: 'string' };
      const checks = (schema as unknown as { _def: { checks?: Array<{ kind: string; value?: number }> } })._def.checks;
      if (checks) {
        for (const c of checks) {
          if (c.kind === 'min' && typeof c.value === 'number') s.minLength = c.value;
          if (c.kind === 'max' && typeof c.value === 'number') s.maxLength = c.value;
          if (c.kind === 'uuid') s.format = 'uuid';
          if (c.kind === 'email') s.format = 'email';
          if (c.kind === 'url') s.format = 'uri';
        }
      }
      return s;
    }
    case ZodFirstPartyTypeKind.ZodNumber: {
      const checks = (schema as unknown as { _def: { checks?: Array<{ kind: string; value?: number }> } })._def.checks;
      const isInt = checks?.some((c) => c.kind === 'int');
      const out: JsonSchema = { type: isInt ? 'integer' : 'number' };
      if (checks) {
        for (const c of checks) {
          if (c.kind === 'min' && typeof c.value === 'number') out.minimum = c.value;
          if (c.kind === 'max' && typeof c.value === 'number') out.maximum = c.value;
        }
      }
      return out;
    }
    case ZodFirstPartyTypeKind.ZodBoolean:
      return { type: 'boolean' };
    case ZodFirstPartyTypeKind.ZodArray: {
      const inner = (schema as unknown as { _def: { type: z.ZodTypeAny } })._def.type;
      return { type: 'array', items: zodToJsonSchema(inner) };
    }
    case ZodFirstPartyTypeKind.ZodEnum: {
      const values = (schema as unknown as { _def: { values: string[] } })._def.values;
      return { type: 'string', enum: values };
    }
    case ZodFirstPartyTypeKind.ZodLiteral: {
      const value = (schema as unknown as { _def: { value: unknown } })._def.value;
      return { const: value };
    }
    case ZodFirstPartyTypeKind.ZodOptional:
    case ZodFirstPartyTypeKind.ZodNullable:
    case ZodFirstPartyTypeKind.ZodDefault: {
      const inner = (schema as unknown as { _def: { innerType: z.ZodTypeAny } })._def.innerType;
      const base = zodToJsonSchema(inner);
      if (typeName === ZodFirstPartyTypeKind.ZodNullable) {
        const types = Array.isArray(base.type) ? base.type : [base.type];
        return { ...base, type: [...new Set([...types, 'null'])] };
      }
      return base;
    }
    case ZodFirstPartyTypeKind.ZodEffects: {
      // `.refine()`, `.transform()`, and `.superRefine()` all wrap the
      // source schema in ZodEffects. The runtime constraint isn't
      // expressible in JSON Schema, but the inner schema describes the
      // shape — surfacing that is what MCP clients (Anthropic API in
      // particular) need to accept the tool. Without this case, *_get
      // tools collapse to `inputSchema: {}` which fails Anthropic's
      // tool-name + schema validation and the model drops the entire
      // server's tool catalog.
      const inner = (schema as unknown as { _def: { schema: z.ZodTypeAny } })._def.schema;
      return zodToJsonSchema(inner);
    }
    case ZodFirstPartyTypeKind.ZodPipeline: {
      // `z.coerce.date()` and friends produce ZodPipeline. Describe the
      // input side of the pipeline.
      const def = (schema as unknown as { _def: { in: z.ZodTypeAny; out: z.ZodTypeAny } })._def;
      return zodToJsonSchema(def.in);
    }
    case ZodFirstPartyTypeKind.ZodReadonly:
    case ZodFirstPartyTypeKind.ZodBranded:
    case ZodFirstPartyTypeKind.ZodCatch: {
      // Pass-through wrappers — describe the inner type.
      const inner = (schema as unknown as { _def: { innerType?: z.ZodTypeAny; type?: z.ZodTypeAny } })._def;
      const wrapped = inner.innerType ?? inner.type;
      return wrapped ? zodToJsonSchema(wrapped) : {};
    }
    case ZodFirstPartyTypeKind.ZodUnion: {
      const options = (schema as unknown as { _def: { options: z.ZodTypeAny[] } })._def.options;
      return { anyOf: options.map((o) => zodToJsonSchema(o)) };
    }
    case ZodFirstPartyTypeKind.ZodRecord:
      return { type: 'object', additionalProperties: true };
    case ZodFirstPartyTypeKind.ZodAny:
    case ZodFirstPartyTypeKind.ZodUnknown:
      return {};
    default:
      // Permissive fallback — unknown types serialize as "any".
      return {};
  }
}
