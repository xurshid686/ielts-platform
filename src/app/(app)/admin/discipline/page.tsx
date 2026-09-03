import { requireAdmin } from "@/lib/auth";
import { listDisciplineMembers, searchStudents } from "@/app/actions/discipline";
import { loadProgramme, loadProgressGrid } from "@/lib/discipline";
import { AdminDiscipline } from "@/components/admin/admin-discipline";

export const metadata = { title: "Discipline" };

export default async function AdminDisciplinePage() {
  // admin/layout.tsx already calls requireAdmin(); repeated here so the page
  // cannot be moved out of that group and silently lose its gate.
  await requireAdmin();

  // The roster loads with the page so the Members tab opens on a full list
  // rather than an empty search box.
  const [membersRes, programme, rosterRes, grid] = await Promise.all([
    listDisciplineMembers(),
    loadProgramme(),
    searchStudents(""),
    loadProgressGrid(),
  ]);
  const members = membersRes.ok ? membersRes.members : [];
  const roster = rosterRes.ok ? rosterRes.users : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Discipline</h1>
        <p className="text-sm text-muted">
          Pick the students, build the day-by-day programme, and watch who is keeping up.
        </p>
      </div>

      {!membersRes.ok && (
        <p className="rounded-lg border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {membersRes.error}
        </p>
      )}

      <AdminDiscipline
        initialMembers={members}
        roster={roster}
        grid={grid}
        days={programme.map((d) => ({
          id: d.id,
          day_number: d.day_number,
          title: d.title,
          instructions: d.instructions,
          tests: d.tests.map((t) => ({
            id: t.id,
            title: t.title,
            skill: t.skill,
            track: t.track,
          })),
        }))}
      />
    </div>
  );
}
