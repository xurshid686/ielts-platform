import { rows } from "@/types/database";

// PostgREST caps a response (1000 rows by default) whether or not the query
// says .limit(), so "no limit" silently truncates. fetchAll() pages until a
// short page comes back. Moved out of lib/mock-admin.ts (2026-11-27) so every
// admin loader can share it; behaviour unchanged. It THROWS on an error: an
// admin list must never read a database hiccup as "nothing there".

const PAGE = 1000;

/** Pages a query builder to exhaustion. `build` must apply a stable order. */
export async function fetchAll<T>(
  label: string,
  build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(`[${label}] failed: ${error.message}`);
    const page = rows<T>(data);
    out.push(...page);
    if (page.length < PAGE) return out;
  }
}
