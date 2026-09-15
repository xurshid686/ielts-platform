import { requireAdmin } from "@/lib/auth";
import { listAttemptsAdmin, listMockPapers, listMocksAdmin, listRequests } from "@/lib/mock";
import { AdminMocks } from "@/components/admin/admin-mocks";

export const metadata = { title: "Mock exams" };

// Gated by admin/layout.tsx (requireAdmin) and /admin in PROTECTED; repeated
// here so the page cannot be moved out of that group and silently lose its
// gate. Every action it calls re-checks with its own assertAdmin().
export default async function AdminMocksPage() {
  await requireAdmin();
  const [requests, mocks, papers, attempts] = await Promise.all([
    listRequests(),
    listMocksAdmin(),
    listMockPapers(),
    listAttemptsAdmin(),
  ]);
  const pending = requests.filter((r) => r.status === "pending").length;
  const toGrade = attempts.filter((a) => a.status === "submitted").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Mock exams</h1>
        <p className="text-sm text-muted">
          {pending || toGrade
            ? [
                pending ? `${pending} request${pending === 1 ? "" : "s"} waiting` : null,
                toGrade ? `${toGrade} attempt${toGrade === 1 ? "" : "s"} to grade or release` : null,
              ]
                .filter(Boolean)
                .join(" · ")
            : "Build mocks, approve places, grade writing and release results. Every attempt is kept."}
        </p>
      </div>
      <AdminMocks requests={requests} mocks={mocks} papers={papers} attempts={attempts} />
    </div>
  );
}
