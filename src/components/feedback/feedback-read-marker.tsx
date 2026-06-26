"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { markFeedbackRead } from "@/app/actions/feedback";

/** Marks the listed feedback items read once, when the /feedback page mounts. */
export function FeedbackReadMarker({ ids }: { ids: string[] }) {
  const router = useRouter();
  useEffect(() => {
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      await Promise.all(ids.map((id) => markFeedbackRead(id)));
      if (!cancelled) router.refresh();
    })();
    return () => {
      cancelled = true;
    };
    // Run once for this set of ids.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")]);
  return null;
}
