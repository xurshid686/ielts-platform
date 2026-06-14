import Link from "next/link";
import { BookOpen, Headphones, Mic, Flame } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";

const PERKS = [
  { icon: BookOpen, text: "Exam-style Reading tests, graded instantly" },
  { icon: Headphones, text: "Listening with real audio and band tracking" },
  { icon: Mic, text: "A live AI examiner you can actually talk to" },
  { icon: Flame, text: "Streaks, XP and a leaderboard that keep you going" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      {/* Brand / hero side */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-brand-gradient p-10 text-white lg:flex">
        <div className="ring-hairline absolute inset-0" />

        <Link href="/" className="relative flex items-center gap-2.5 text-lg font-semibold">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white shadow-sm">
            <Logo size={38} />
          </span>
          IELTS Practice
        </Link>

        <div className="relative max-w-md space-y-7">
          <h1 className="text-balance text-4xl font-bold leading-[1.15] tracking-tight">
            Master all four IELTS skills, one streak at a time.
          </h1>
          <ul className="space-y-3.5">
            {PERKS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/12 backdrop-blur-sm">
                  <Icon className="h-4.5 w-4.5" />
                </span>
                <span className="text-sm leading-snug">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-white/60">
          © {new Date().getFullYear()} IELTS Practice Platform
        </p>
      </div>

      {/* Form side */}
      <div className="relative flex items-center justify-center p-6">
        <div className="bg-grid-faint pointer-events-none absolute inset-x-0 top-0 h-96 lg:hidden" />
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="relative w-full max-w-sm animate-fade-in-up">{children}</div>
      </div>
    </div>
  );
}
