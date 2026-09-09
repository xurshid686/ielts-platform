"use client";

import { useState } from "react";
import { BookOpen, Headphones } from "lucide-react";
import { TestBrowser, type BrowserItem } from "@/components/sections/test-browser";

/**
 * Reading / Listening switcher for the Cambridge catalogue.
 *
 * The two skills used to render stacked, one section under the other, which
 * meant a student who wanted listening had to scroll past every reading paper —
 * and `TestBrowser` brings its own search box and format tabs, so stacking put
 * two full sets of controls on one page.
 *
 * Only ONE browser is mounted at a time. Rendering both and hiding one with
 * `hidden` would keep two independent search/filter/paging states alive, and
 * switching back would show stale filters the student cannot see.
 *
 * The pill styling is `TestBrowser`'s own format-tab styling, deliberately: this
 * row sits directly above that one, and two rows of tabs that looked different
 * would read as two unrelated controls.
 */
export function CambridgeSkillTabs({
  reading,
  listening,
  isAdmin,
}: {
  reading: BrowserItem[];
  listening: BrowserItem[];
  isAdmin: boolean;
}) {
  // Start on whichever skill actually has papers, so a section holding only
  // listening tests does not open on an empty Reading tab.
  const [skill, setSkill] = useState<"reading" | "listening">(
    reading.length === 0 && listening.length > 0 ? "listening" : "reading",
  );

  const tabs = [
    { key: "reading" as const, label: "Reading", icon: BookOpen, count: reading.length },
    { key: "listening" as const, label: "Listening", icon: Headphones, count: listening.length },
  ];

  const items = skill === "reading" ? reading : listening;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = skill === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setSkill(t.key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-surface text-muted hover:bg-surface-2 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              <span
                className={`rounded-full px-1.5 text-xs tabular-nums ${
                  active ? "bg-primary/15" : "bg-surface-2"
                }`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-surface p-5 text-sm text-muted shadow-soft">
          No Cambridge {skill} tests yet. They will appear here as soon as they are uploaded.
        </p>
      ) : (
        // Keyed on the skill so switching remounts the browser rather than
        // carrying the previous skill's search text and format tab across.
        <TestBrowser key={skill} items={items} skill={skill} canAccessPremium isAdmin={isAdmin} />
      )}
    </div>
  );
}
