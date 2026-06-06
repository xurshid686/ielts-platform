"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteTest } from "@/app/actions/admin";

export function DeleteTestButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function onClick() {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
      return;
    }
    start(async () => {
      const res = await deleteTest(id);
      if (!res.ok) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <button
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
      {pending ? "Deleting…" : confirming ? "Click to confirm" : "Delete"}
    </button>
  );
}
