"use client";

import { usePathname } from "next/navigation";

/**
 * The student header and the capped-width <main> wrap every signed-in page
 * EXCEPT the admin panel, which brings its own full-screen shell (sidebar +
 * top bar, src/components/admin/shell). The header is rendered on the server
 * and handed in as a node, so this switch adds no client work to it.
 */
export function ChromeSwitch({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return <>{children}</>;
  return (
    <div className="flex min-h-screen flex-col">
      {header}
      {/* The old sidebar ate 260px, so pages never had to cap their own width.
          Without it they ran edge to edge on a wide monitor. */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8 lg:py-8">{children}</main>
    </div>
  );
}
