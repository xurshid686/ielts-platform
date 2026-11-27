"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";

/** Student search that lands on Members. Lives at the top of the admin sidebar
 *  (v2.1: the site header now stays on /admin, so there is no admin top bar). */
export function AdminSearch({ className }: { className?: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  return (
    <form
      role="search"
      className={"relative " + (className ?? "")}
      onSubmit={(e) => {
        e.preventDefault();
        const v = q.trim();
        router.push(v ? `/admin/members?q=${encodeURIComponent(v)}` : "/admin/members");
      }}
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Find a student…"
        aria-label="Find a student"
        className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-2 text-[13px] outline-none placeholder:text-muted focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
      />
    </form>
  );
}
