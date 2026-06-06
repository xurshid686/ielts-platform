import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/card";
import { UploadForm } from "@/components/admin/upload-form";
import { DeleteTestButton } from "@/components/admin/delete-test-button";
import type { Test } from "@/types/database";

export default async function AdminTestsPage() {
  const supabase = await createClient();
  const { data: tests } = await supabase
    .from("tests")
    .select("*")
    .order("created_at", { ascending: false });
  const list = (tests ?? []) as Test[];

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin" className="text-sm text-muted hover:text-foreground">
          ← Admin
        </Link>
        <h1 className="text-2xl font-bold">Manage tests</h1>
        <p className="text-muted">
          Upload self-contained HTML reading/listening tests. They appear instantly to students.
        </p>
      </div>

      <Card>
        <h2 className="mb-4 font-semibold">Upload a test</h2>
        <UploadForm />
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-semibold">All tests ({list.length})</h2>
        <Card className="p-0">
          {list.length === 0 ? (
            <p className="p-6 text-center text-muted">No tests uploaded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{t.title}</p>
                    <p className="text-xs capitalize text-muted">
                      {t.skill}
                      {t.passage ? ` · Passage ${t.passage}` : ""}
                      {t.level ? ` · ${t.level}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`/api/test-html/${t.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted hover:bg-surface-2"
                    >
                      Preview
                    </a>
                    <DeleteTestButton id={t.id} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}
