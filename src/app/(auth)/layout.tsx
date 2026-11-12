/**
 * Deliberately empty. The frame for these four pages is `AuthShell`
 * (components/auth/auth-shell.tsx), rendered by each page, because its left
 * panel differs per page and a layout cannot tell which page it wraps.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
