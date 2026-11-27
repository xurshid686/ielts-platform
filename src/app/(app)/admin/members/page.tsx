import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AdminMembers } from "@/components/admin/admin-members";
import { QuickPremium } from "@/components/admin/member-bits";
import { Avatar, PremiumChip } from "@/components/admin/ui/person";
import { Badge, Empty, PageHeader, Panel } from "@/components/admin/ui/primitives";
import type { MemberRow } from "@/app/actions/admin";
import { rows } from "@/types/database";
import { allUltima } from "@/lib/ultima";
import { levelLabel } from "@/lib/levels";
import { cn } from "@/lib/utils";
import {
  MEMBER_SORTS,
  MEMBER_STAGES,
  loadMembersPage,
  parseMembersQuery,
  type MemberTableRow,
  type MembersQuery,
} from "@/lib/admin/members";

type SP = Promise<Record<string, string | string[] | undefined>>;

function href(q: MembersQuery, patch: Partial<MembersQuery>): string {
  const n = { ...q, page: 1, ...patch };
  const p = new URLSearchParams();
  if (n.q) p.set("q", n.q);
  if (n.stage !== "all") p.set("stage", n.stage);
  if (n.sort !== "joined") p.set("sort", n.sort);
  if (n.page > 1) p.set("page", String(n.page));
  const s = p.toString();
  return s ? `/admin/members?${s}` : "/admin/members";
}

export default async function AdminMembersPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;

  // The previous screen, kept whole: per-row Premium/Ultima/XP/level controls
  // for working through many students at once.
  if (sp.view === "bulk") return <BulkView />;

  const query = parseMembersQuery(sp);
  const { rows: list, total, pages } = await loadMembersPage(query);

  return (
    <div>
      <PageHeader
        title="Members"
        description={`${total.toLocaleString("en-US")} ${total === 1 ? "account" : "accounts"}${query.q ? ` matching “${query.q}”` : ""}. Open a student to see everything about them and manage their access.`}
        actions={
          <Link href="/admin/members?view=bulk" className="text-xs text-muted hover:text-foreground hover:underline">
            Bulk tools →
          </Link>
        }
      />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <form action="/admin/members" className="flex items-center gap-2">
          {query.stage !== "all" && <input type="hidden" name="stage" value={query.stage} />}
          {query.sort !== "joined" && <input type="hidden" name="sort" value={query.sort} />}
          <input
            name="q"
            defaultValue={query.q}
            placeholder="Name or email"
            className="h-8 w-56 rounded-md border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-primary/60"
          />
          <button className="h-8 rounded-md bg-foreground px-3 text-xs font-medium text-background">Search</button>
          {query.q && (
            <Link href={href(query, { q: "" })} className="text-xs text-muted hover:underline">
              Clear
            </Link>
          )}
        </form>
        <div className="ml-auto flex flex-wrap gap-1">
          {MEMBER_STAGES.map((s) => (
            <Link
              key={s.id}
              href={href(query, { stage: s.id })}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium",
                query.stage === s.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted hover:text-foreground",
              )}
            >
              {s.label}
            </Link>
          ))}
        </div>
      </div>

      <Panel bodyClassName="p-0">
        {list.length === 0 ? (
          <Empty>No students match.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="bg-surface text-xs text-muted">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium">Student</th>
                  <SortTh q={query} id="joined" label="Joined" />
                  <SortTh q={query} id="active" label="Last active" />
                  <SortTh q={query} id="xp" label="XP" right />
                  <SortTh q={query} id="rating" label="Rating" right />
                  <th className="px-3 py-2 text-left font-medium">Level</th>
                  <SortTh q={query} id="premium" label="Premium" />
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {list.map((u) => (
                  <Row key={u.id} u={u} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {pages > 1 && (
        <nav className="mt-3 flex items-center justify-between text-xs text-muted" aria-label="Pages">
          <span>
            Page {query.page} of {pages}
          </span>
          <div className="flex gap-1">
            {query.page > 1 && (
              <Link href={href(query, { page: query.page - 1 })} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-foreground">
                <ChevronLeft className="h-3.5 w-3.5" /> Previous
              </Link>
            )}
            {query.page < pages && (
              <Link href={href(query, { page: query.page + 1 })} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:text-foreground">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}

function SortTh({ q, id, label, right }: { q: MembersQuery; id: MembersQuery["sort"]; label: string; right?: boolean }) {
  const active = q.sort === id;
  const name = MEMBER_SORTS.find((s) => s.id === id)?.label ?? label;
  return (
    <th className={cn("px-3 py-2 font-medium", right ? "text-right" : "text-left")} aria-sort={active ? "descending" : undefined}>
      <Link href={href(q, { sort: id })} className={cn("hover:text-foreground", active && "text-foreground")} title={`Sort by ${name}`}>
        {label}
        {active && " ↓"}
      </Link>
    </th>
  );
}

function Row({ u }: { u: MemberTableRow }) {
  return (
    <tr className="border-b border-border last:border-0 hover:bg-surface-2/50">
      <td className="px-4 py-2">
        <Link href={`/admin/members/${u.id}`} className="flex min-w-0 items-center gap-2.5">
          <Avatar name={u.name || u.email} url={u.avatar_url} />
          <span className="min-w-0">
            <span className="block truncate font-medium hover:text-primary">
              {u.name || "Unnamed"}
              {u.is_owner ? (
                <Badge tone="primary" className="ml-1.5">owner</Badge>
              ) : u.role === "admin" ? (
                <Badge tone="primary" className="ml-1.5">admin</Badge>
              ) : null}
              {u.hidden_from_leaderboard && <Badge className="ml-1.5">hidden</Badge>}
            </span>
            <span className="block max-w-64 truncate text-xs text-muted">{u.email}</span>
          </span>
        </Link>
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-muted">{u.created_at.slice(0, 10)}</td>
      <td className="whitespace-nowrap px-3 py-2 text-muted">{u.last_activity_date ?? "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums">{u.xp.toLocaleString("en-US")}</td>
      <td className="px-3 py-2 text-right tabular-nums">{u.rating}</td>
      <td className="whitespace-nowrap px-3 py-2 text-muted">{u.level === "regular" ? "—" : levelLabel(u.level)}</td>
      <td className="whitespace-nowrap px-3 py-2">
        <PremiumChip until={u.premium_until} membership={u.membership} />
        {u.ultima_active && <Badge tone="premium" className="ml-1">Ultima</Badge>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-right">
        <span className="inline-flex items-center gap-2">
          <QuickPremium email={u.email} />
          <Link href={`/admin/members/${u.id}`} className="rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background">
            Open
          </Link>
        </span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------- bulk view

async function BulkView() {
  const supabase = await createClient();
  const COLUMNS =
    "id, email, name, avatar_url, role, level, premium_until, xp, hidden_from_leaderboard, last_activity_date";
  // Unchanged from the previous Members page: newest 500 plus everyone who
  // ever held Premium, so the Lapsed filter still finds old members.
  const [{ data }, { data: everPremium }] = await Promise.all([
    supabase.from("profiles").select(COLUMNS).order("created_at", { ascending: false }).limit(500),
    supabase
      .from("profiles")
      .select(COLUMNS)
      .not("premium_until", "is", null)
      .order("premium_until", { ascending: false })
      .limit(1000),
  ]);
  const recent = rows<MemberRow>(data);
  const seen = new Set(recent.map((u) => u.id));
  const ultima = await allUltima();
  const initialUsers = [...recent, ...rows<MemberRow>(everPremium).filter((u) => !seen.has(u.id))].map((u) => ({
    ...u,
    ultima_until: ultima.get(u.id) ?? null,
  }));

  return (
    <div>
      <PageHeader
        title="Members · bulk tools"
        description="Grant Premium or Ultima, gift XP, change levels and send weekly reports, row by row."
        actions={
          <Link href="/admin/members" className="text-xs text-muted hover:text-foreground hover:underline">
            ← Back to the table
          </Link>
        }
      />
      <AdminMembers initialUsers={initialUsers} />
    </div>
  );
}
