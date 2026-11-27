"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

/** Slim top bar: a student search that lands on Members, theme, and who is signed in. */
export function AdminTopbar({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <header className="sticky top-0 z-20 hidden h-14 lg:flex items-center gap-3 border-b border-border bg-surface/90 px-6 backdrop-blur">
      <form
        role="search"
        className="relative w-full max-w-md"
        onSubmit={(e) => {
          e.preventDefault();
          const v = q.trim();
          router.push(v ? `/admin/members?q=${encodeURIComponent(v)}` : "/admin/members");
        }}
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a student by name or email…"
          aria-label="Find a student"
          className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-[13px] outline-none placeholder:text-muted focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
        />
      </form>
      <div className="ml-auto flex items-center gap-3">
        <ThemeToggle />
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-[13px] font-medium">{name}</p>
          <p className="text-[11px] text-muted">{role}</p>
        </div>
      </div>
    </header>
  );
}
