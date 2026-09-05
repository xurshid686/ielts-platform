import { requireAdmin } from "@/lib/auth";
import { searchStudents } from "@/app/actions/discipline";
import { loadProgramme, loadProgressGrid, membersFromGrid } from "@/lib/discipline";
import { AdminDiscipline } from "@/components/admin/admin-discipline";

export const metadata = { title: "Discipline" };

export default async function AdminDisciplinePage() {
  // admin/layout.tsx already calls requireAdmin(); repeated here so the page
  // cannot be moved out of that group and silently lose its gate.
  await requireAdmin();

  // The roster loads with the page so the Members tab opens on a full list
  // rather than an empty search box.
  //
  // The Members tab is derived from the SAME grid the Progress tab renders, so
  // the two can never disagree about which day a student is on — the exact
  // disagreement the stored day counter used to produce.
  const [programme, rosterRes, grid] = await Promise.all([
    // `true` = drafts included. This is the one place they are visible; every
    // student-facing loader filters them out (0047).
    loadProgramme(true),
    searchStudents(""),
    loadProgressGrid(),
  ]);
  const members = membersFromGrid(grid);
  const roster = rosterRes.ok ? rosterRes.users : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Discipline</h1>
        <p className="text-sm text-muted">
          Pick the students, build the day-by-day programme, and watch who is keeping up.
        </p>
      </div>

      <AdminDiscipline
        initialMembers={members}
        roster={roster}
        grid={grid}
        days={programme.map((d) => ({
          id: d.id,
          day_number: d.day_number,
          title: d.title,
          instructions: d.instructions,
          published: d.published,
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
