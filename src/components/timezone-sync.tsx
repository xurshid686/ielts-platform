"use client";

import { useEffect, useRef } from "react";
import { setTimezone } from "@/app/actions/profile";

// Silently keeps the user's stored timezone in sync with their browser, so
// streaks and weekly reports roll over at the right local moment. Fires once
// per mount, only when the detected zone differs from what's stored.
export function TimezoneSync({ current }: { current: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    let tz: string | undefined;
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (tz && tz !== current) {
      setTimezone(tz);
    }
  }, [current]);
  return null;
}
