// ---------------------------------------------------------------------------
// MCP Tool Registry
// ---------------------------------------------------------------------------
// Transport-agnostic catalog. Tools are pure async functions:
//
//   (ctx: MCPContext, input: validatedZodOutput) => Promise<output>
//
// They never know whether they were called over HTTP, stdio, or in-process.
// That's how the same registry serves external agents, internal AI agents,
// workflow engines, and the eventual REST v2.
//
// Each tool declares:
//   - name           dotted, namespaced (e.g. 'tickets.list')
//   - description    one-paragraph human description (powers manifest)
//   - scope          required scope (e.g. 'tickets:read')
//   - inputSchema    zod schema; describes args + auto-generates JSON Schema
//   - outputSchema   optional zod schema for return shape
//   - handler        the function above
//   - meta           optional: since, deprecated, tags
// ---------------------------------------------------------------------------

import 'server-only';

import { z } from 'zod';

import type { MCPContext } from './context';
import { invalidParams, methodNotFound } from './errors';

export interface ToolMeta {
  /** Semver of when the tool was introduced. */
  since?: string;
  /** Semver of when the tool was deprecated. Clients should migrate. */
  deprecated?: string;
  tags?: string[];
}

export interface ToolDefinition<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput = unknown,
> {
  name: string;
  description: string;
  scope: string;
  inputSchema: TInput;
  outputSchema?: z.ZodTypeAny;
  handler: (ctx: MCPContext, input: z.infer<TInput>) => Promise<TOutput>;
  meta?: ToolMeta;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register<T extends z.ZodTypeAny, R>(def: ToolDefinition<T, R>): void {
    if (this.tools.has(def.name)) {
      throw new Error(`Duplicate tool registration: ${def.name}`);
    }
    this.tools.set(def.name, def as unknown as ToolDefinition);
  }

  registerMany(defs: ToolDefinition[]): void {
    for (const d of defs) this.register(d);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }

  /**
   * Invokes a tool: scope-checks, validates input, runs handler, validates
   * output (if schema provided). Throws McpError for any failure path.
   *
   * Audit logging is performed by the caller (handler/route), not here, so
   * we can record duration_ms and outcome consistently regardless of who
   * invokes the registry (HTTP, internal worker, test).
   */
  async invoke(
    name: string,
    ctx: MCPContext,
    rawInput: unknown,
  ): Promise<unknown> {
    const def = this.tools.get(name);
    if (!def) throw methodNotFound(name);

    ctx.requireScope(def.scope);

    const parsed = def.inputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      throw invalidParams(
        'Invalid arguments for ' + name,
        parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
          code: i.code,
        })),
      );
    }

    const result = await def.handler(ctx, parsed.data);

    return result;
  }
}

// Singleton registry. Tools register themselves on first import via
// `mcp/server.ts` which loads each domain module.
export const registry = new ToolRegistry();
