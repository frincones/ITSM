// ---------------------------------------------------------------------------
// Shared MCP Zod Schemas
// ---------------------------------------------------------------------------
// Reusable input fragments. Domain-specific schemas live alongside their
// tool modules (lib/mcp/tools/<domain>.ts).
// ---------------------------------------------------------------------------

import { z } from 'zod';

export const PaginationInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export type Pagination = z.infer<typeof PaginationInput>;

export const PaginationOutput = z.object({
  page: z.number().int(),
  limit: z.number().int(),
  total: z.number().int(),
  total_pages: z.number().int(),
});

export const SortInput = z.object({
  sort_by: z.string().optional(),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
});

export const UuidString = z.string().uuid();
export const UuidOrNull = z.string().uuid().nullable().optional();

/**
 * Range helper: builds an offset/limit pair from a Pagination input.
 * Centralized so all tools paginate identically.
 */
export function rangeFromPagination(p: Pagination): {
  from: number;
  to: number;
} {
  const from = (p.page - 1) * p.limit;
  return { from, to: from + p.limit - 1 };
}

export function buildPaginationOutput(
  p: Pagination,
  total: number | null | undefined,
): z.infer<typeof PaginationOutput> {
  const safeTotal = total ?? 0;
  return {
    page: p.page,
    limit: p.limit,
    total: safeTotal,
    total_pages: p.limit > 0 ? Math.ceil(safeTotal / p.limit) : 0,
  };
}
