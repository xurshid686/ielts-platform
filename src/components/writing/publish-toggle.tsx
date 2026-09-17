"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { setPracticeQuestionPublished } from "@/app/actions/writing-practice";
import { Button } from "@/components/ui/button";

/**
 * Publish or hide one practice question.
 *
 * Unpublishing is the ONLY way to withdraw one: attempts point at the question
 * row with `on delete restrict`, so deleting it would mean deleting somebody's
 * work. A hidden question disappears from the catalogue and refuses new
 * sittings, while every essay already written about it still opens.
 *
 * router.refresh(), never window.location.reload() — the admin-page rule.
 */
export function PublishToggle({ id, published }: { id: string; published: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={published ? "outline" : "primary"}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const res = await setPracticeQuestionPublished(id, !published);
            setError(res.ok ? null : res.error);
            if (res.ok) router.refresh();
          })
        }
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : published ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
        {published ? "Hide" : "Publish"}
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}
