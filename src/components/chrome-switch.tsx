"use client";

import { usePathname } from "next/navigation";

/**
 * The site header wraps every signed-in page, the admin panel included (v2.1:
 * dropping it made admin feel like another website). Only the capped-width
 * <main> is skipped on /admin, whose layout brings a sidebar + wide main.
 * The header is rendered on the server and handed in as a node.
 */
export function ChromeSwitch({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const admin = pathname === "/admin" || pathname.startsWith("/admin/");
  return (
    <div className="flex min-h-screen flex-col">
      {header}
      {admin ? (
        children
      ) : (
        /* The old sidebar ate 260px, so pages never had to cap their own width.
           Without it they ran edge to edge on a wide monitor. */
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      )}
    </div>
  );
}
