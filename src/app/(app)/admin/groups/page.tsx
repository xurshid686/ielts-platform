import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { loadAllGroups } from "@/lib/admin/groups";
import { Badge, Empty, PageHeader, Panel } from "@/components/admin/ui/primitives";
import { GroupRowActions } from "@/components/admin/group-row-actions";

export const metadata = { title: "Friends groups · Admin" };

/** Every Friends group (0077/0078) with its members and the admin's controls. */
export default async function AdminGroupsPage() {
  await requireAdmin();
  const groups = await loadAllGroups();
  const active = groups.filter((g) => g.active);
  const members = active.reduce((s, g) => s + g.members.length, 0);

  return (
    <div>
      <PageHeader
        title="Friends groups"
        description={`${active.length} active of ${groups.length} · ${members} members in active groups`}
      />
      {groups.length === 0 ? (
        <Panel>
          <Empty>No Friends groups yet. Create one from a student&apos;s page (Manage → Friends group).</Empty>
        </Panel>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const buyer = g.members.find((m) => m.is_owner);
            const perMember = g.members.length
              ? Math.round(g.members.reduce((s, m) => s + m.points_week, 0) / g.members.length)
              : 0;
            return (
              <Panel
                key={g.id}
                title={
                  <span className="flex flex-wrap items-center gap-2" data-group={g.id}>
                    {g.name}
                    {g.active ? (
                      <Badge tone="success">until {g.expires_at.slice(0, 10)}</Badge>
                    ) : (
                      <Badge tone="danger">ended {g.expires_at.slice(0, 10)}</Badge>
                    )}
                    {g.hidden && <Badge tone="warning">hidden</Badge>}
                  </span>
                }
                description={`Buyer ${buyer?.name ?? "?"} · ${g.members.length}/${g.seats} members · ${g.pending.length} pending · ${perMember} pts/member this week · goal ${Math.min(g.goal.done, g.goal.target)}/${g.goal.target}${g.goal.reached ? " ✓" : ""}`}
              >
                <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
                  <ul className="flex flex-wrap content-start gap-2 text-[13px]">
                    {g.members.map((m) => (
                      <li key={m.id}>
                        <Link
                          href={`/admin/members/${m.id}`}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 hover:bg-surface-2"
                        >
                          {m.name}
                          {m.is_owner && <span className="text-premium">· buyer</span>}
                          <span className="text-muted">· {m.points_week} pts</span>
                        </Link>
                      </li>
                    ))}
                    {g.pending.map((p) => (
                      <li
                        key={p.id}
                        className="inline-flex items-center gap-1 rounded-md border border-dashed border-border px-2 py-1 text-muted"
                      >
                        {p.name} · invited
                      </li>
                    ))}
                  </ul>
                  <GroupRowActions
                    groupId={g.id}
                    ownerId={g.owner_id}
                    name={g.name}
                    customName={g.custom_name}
                    hidden={g.hidden}
                    members={g.members.map((m) => ({ id: m.id, name: m.name, is_owner: m.is_owner }))}
                  />
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </div>
  );
}
