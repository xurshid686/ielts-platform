"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, X } from "lucide-react";
import { renameTest } from "@/app/actions/admin";

/**
 * The test title, editable in place.
 *
 * Renaming edits the existing row rather than replacing it: the id is what
 * `results` rows point at, so a delete-and-reupload would
 * take a student's history with it. See renameTest() in app/actions/admin.ts.
 */
export function RenameTestButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);

  function save() {
    const next = value.trim();
    if (!next || next === title) {
      setEditing(false);
      setValue(title);
      return;
    }
    start(async () => {
      const res = await renameTest(id, next);
      if (!res.ok) {
        alert(res.error);
        return; // stay in edit mode so the name can be corrected
      }
      setEditing(false);
      router.refresh();
    });
  }

  function cancel() {
    setEditing(false);
    setValue(title);
  }

  if (!editing) {
    return (
      <div className="flex min-w-0 items-center gap-1.5">
        <p className="truncate font-medium">{title}</p>
        <button
          onClick={() => setEditing(true)}
          aria-label={`Rename ${title}`}
          className="shrink-0 rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <input
        autoFocus
        value={value}
        disabled={pending}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 text-sm disabled:opacity-60"
      />
      <button
        onClick={save}
        disabled={pending || !value.trim() || value.trim() === title}
        aria-label="Save name"
        className="shrink-0 rounded p-1 text-success hover:bg-success/10 disabled:opacity-40"
      >
        <Check className="h-4 w-4" />
      </button>
      <button
        onClick={cancel}
        disabled={pending}
        aria-label="Cancel rename"
        className="shrink-0 rounded p-1 text-muted hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
