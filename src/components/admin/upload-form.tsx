"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { uploadTest } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";

export function UploadForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [loading, setLoading] = useState(false);
  const [skill, setSkill] = useState("reading");
  const [kind, setKind] = useState("single");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function action(formData: FormData) {
    setLoading(true);
    setMsg(null);
    const res = await uploadTest(formData);
    setLoading(false);
    if (res.ok) {
      setMsg({ ok: true, text: "Test uploaded." });
      formRef.current?.reset();
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error });
    }
  }

  return (
    <form ref={formRef} action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Title</span>
          <input name="title" required placeholder="Cambridge 18 — Test 1" className="admin-input" />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Skill</span>
          <select
            name="skill"
            required
            className="admin-input"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
          >
            <option value="reading">Reading</option>
            <option value="listening">Listening</option>
          </select>
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Type</span>
          <select
            name="kind"
            required
            className="admin-input"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="single">
              {skill === "listening" ? "Single section" : "Single passage"}
            </option>
            <option value="full">Full test</option>
          </select>
        </label>
        {skill === "reading" && kind === "single" && (
          <label className="space-y-1.5">
            <span className="text-sm font-medium">Passage</span>
            <select name="passage" className="admin-input" defaultValue="">
              <option value="">— select —</option>
              <option value="1">Passage 1</option>
              <option value="2">Passage 2</option>
              <option value="3">Passage 3</option>
            </select>
          </label>
        )}
        <label className="space-y-1.5">
          <span className="text-sm font-medium">Level (optional)</span>
          <input name="level" placeholder="Band 6–7" className="admin-input" />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">HTML file</span>
          <input name="file" type="file" accept=".html,text/html" required className="admin-input pt-2" />
        </label>
      </div>

      {msg && (
        <p className={`text-sm ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>
      )}

      <Button type="submit" disabled={loading}>
        <UploadCloud className="h-4 w-4" />
        {loading ? "Uploading…" : "Upload test"}
      </Button>

      <style jsx>{`
        :global(.admin-input) {
          width: 100%;
          height: 2.5rem;
          border-radius: 0.5rem;
          border: 1px solid var(--border);
          background: var(--surface-2);
          color: var(--foreground);
          padding: 0 0.75rem;
          font-size: 0.9rem;
          outline: none;
        }
        :global(.admin-input:focus) {
          border-color: var(--ring);
        }
      `}</style>
    </form>
  );
}
