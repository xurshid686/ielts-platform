import { requireAdmin } from "@/lib/auth";
import { getMockVideos, signedTask1Image } from "@/lib/mock";
import {
  listAttemptsAdmin,
  listMockPapers,
  listMocksAdmin,
  listPendingRequests,
  listRecentDecisions,
} from "@/lib/mock-admin";
import { AdminMocks } from "@/components/admin/admin-mocks";

export const metadata = { title: "Mock exams" };

// Gated by admin/layout.tsx (requireAdmin) and /admin in PROTECTED; repeated
// here so the page cannot be moved out of that group and silently lose its
// gate. Every action it calls re-checks with its own assertAdmin().
//
// The loaders throw on a database error rather than returning empty lists, so
// a failure lands on the admin error boundary instead of reading as "nothing
// waiting" (see lib/mock-admin.ts).
export default async function AdminMocksPage() {
  await requireAdmin();
  const [pending, decisions, mocks, papers, attempts, videoRows] = await Promise.all([
    listPendingRequests(),
    listRecentDecisions(),
    listMocksAdmin(),
    listMockPapers(),
    listAttemptsAdmin(),
    getMockVideos(),
  ]);
  const videos = Object.fromEntries(Object.entries(videoRows).map(([k, v]) => [k, { url: v!.url, duration: v!.duration }]));

  const images: Record<string, string> = {};
  await Promise.all(
    mocks
      .filter((m) => m.writing_task1_image_path)
      .map(async (m) => {
        const url = await signedTask1Image(m.writing_task1_image_path);
        if (url) images[m.id] = url;
      }),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Mock exams</h1>
        <p className="text-sm text-muted">
          Build mocks, approve places, grade writing and release results. Every attempt is kept.
        </p>
      </div>
      <AdminMocks
        pending={pending}
        decisions={decisions}
        mocks={mocks}
        papers={papers}
        attempts={attempts}
        images={images}
        videos={videos}
      />
    </div>
  );
}
