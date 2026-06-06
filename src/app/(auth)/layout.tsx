import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand / hero side */}
      <div className="relative hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <Link href="/" className="flex items-center gap-2 text-lg font-semibold">
          <GraduationCap className="h-6 w-6" /> IELTS Practice
        </Link>
        <div className="space-y-4">
          <h1 className="text-3xl font-bold leading-tight">
            Master all four IELTS skills, one streak at a time. 🔥
          </h1>
          <p className="max-w-md text-primary-foreground/80">
            Reading, Listening, Writing and Speaking — real practice, instant
            scoring, and progress tracking that keeps you coming back daily.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/60">
          © {new Date().getFullYear()} IELTS Practice Platform
        </p>
      </div>

      {/* Form side */}
      <div className="relative flex items-center justify-center p-6">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  );
}
