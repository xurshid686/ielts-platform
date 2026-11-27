import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Flag } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { loadStudent360, liveStreakOf, type S360 } from "@/lib/admin/student-360";
import { levelLabel } from "@/lib/levels";
import { formatUzs } from "@/lib/site";
import { cn } from "@/lib/utils";
import { Badge, Empty, Panel, StatTile } from "@/components/admin/ui/primitives";
import { Avatar, PremiumChip } from "@/components/admin/ui/person";
import { StudentActions } from "@/components/admin/student-actions";
import { BandTrend } from "@/components/dashboard/band-trend";
import { ActivityHeatmap } from "@/components/dashboard/activity-heatmap";

// Student 360 (admin panel v2, owner 2026-11-27): one page with everything
// about a student and every action on them. Read by loadStudent360() with the
// service role; this page is the gate.

const TABS = [
  { id: "tests", label: "Tests" },
  { id: "mocks", label: "Mocks" },
  { id: "writing", label: "Writing & speaking" },
  { id: "money", label: "Money" },
  { id: "support", label: "Reports & emails" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export default async function Student360Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const s = await loadStudent360(id);
  if (!s) notFound();
  const tabParam = Array.isArray(sp.tab) ? sp.tab[0] : sp.tab;
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? (tabParam as Tab) : "tests";
  const p = s.profile;

  const counts: Record<Tab, number> = {
    tests: s.resultsTotal,
    mocks: s.mocks.length,
    writing: s.writing.length + s.speaking.length,
    money: s.orders.length + s.passes.length,
    support: s.reports.length,
  };

  const readingPoints = s.results
    .filter((r) => r.skill === "reading" && r.band != null)
    .map((r) => ({ band: r.band as number, at: r.submitted_at }))
    .reverse()
    .slice(-30);

  return (
    <div className="space-y-4">
      <Link href="/admin/members" className="inline-flex items-center gap-1 text-xs text-muted hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Members
      </Link>

      {/* Header */}
      <section className="flex flex-wrap items-start gap-4 rounded-xl border border-border bg-surface p-5 shadow-soft">
        <Avatar name={p.name || p.email} url={p.avatar_url} size={56} />
        <div className="min-w-0 flex-1">
          <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            {p.name || "Unnamed student"}
            {p.is_owner ? <Badge tone="primary">owner</Badge> : p.role === "admin" ? <Badge tone="primary">admin</Badge> : null}
          </h1>
          <p className="text-[13px] text-muted">{p.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <PremiumChip until={p.premium_until} membership={p.premium_until ? s.membership : null} />
            {s.ultima?.active && <Badge tone="premium">Ultima until {s.ultima.until.slice(0, 10)}</Badge>}
            {s.trial && (
              <Badge tone={s.trial.active ? "success" : "neutral"}>
                {s.trial.active ? `Trial until ${s.trial.ends_at.slice(0, 10)}` : "Trial used"}
              </Badge>
            )}
            {p.level !== "regular" && <Badge>{levelLabel(p.level)}</Badge>}
            {p.hidden_from_leaderboard && <Badge tone="warning">Hidden from leaderboard</Badge>}
            {s.discipline && <Badge>Discipline · {s.discipline.strikes} strikes</Badge>}
            {s.bot && <Badge>Telegram bot{s.bot.daily_on ? " · daily on" : ""}</Badge>}
            {p.email_reminders === false && <Badge>Unsubscribed from emails</Badge>}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
          <dt className="text-muted">Joined</dt>
          <dd className="tabular-nums">{p.created_at.slice(0, 10)}</dd>
          <dt className="text-muted">Last active</dt>
          <dd className="tabular-nums">{p.last_activity_date ?? "never"}</dd>
          <dt className="text-muted">Time zone</dt>
          <dd>{p.timezone ?? "UTC"}</dd>
          <dt className="text-muted">Target band</dt>
          <dd>{p.target_band ?? "—"}</dd>
          <dt className="text-muted">Public profile</dt>
          <dd>
            <Link href={`/u/${p.id}`} className="inline-flex items-center gap-1 text-primary hover:underline" target="_blank">
              open <ExternalLink className="h-3 w-3" />
            </Link>
          </dd>
        </dl>
      </section>

      {/* Stat strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Tests taken" value={s.stats.total_attempts} hint={`${s.stats.reading_attempts} reading`} />
        <StatTile label="Best band" value={s.stats.best_band ?? "—"} />
        <StatTile label="First-attempt average" value={s.stats.first_attempt_avg_band ?? "—"} />
        <StatTile label="Accuracy" value={s.stats.accuracy == null ? "—" : `${s.stats.accuracy}%`} />
        <StatTile label="Rating" value={p.rating} hint={`peak ${p.peak_rating} · ${p.rated_count} rated`} />
        <StatTile label="XP · streak" value={p.xp.toLocaleString("en-US")} hint={`${liveStreakOf(p)}-day streak · best ${p.longest_streak}`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            {readingPoints.length >= 2 ? (
              <BandTrend points={readingPoints} title="Reading band, last 30 tests" />
            ) : (
              <Panel title="Reading band">
                <Empty>Fewer than two reading tests.</Empty>
              </Panel>
            )}
            <ActivityHeatmap dates={s.activityDates} />
          </div>

          {/* Tabs */}
          <nav className="flex gap-1 border-b border-border" aria-label="Sections">
            {TABS.map((t) => (
              <Link
                key={t.id}
                href={`/admin/members/${p.id}?tab=${t.id}`}
                scroll={false}
                aria-current={tab === t.id ? "page" : undefined}
                className={cn(
                  "-mb-px border-b-2 px-3 py-2 text-[13px] font-medium",
                  tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted hover:text-foreground",
                )}
              >
                {t.label}
                <span className="ml-1.5 text-xs text-muted tabular-nums">{counts[t.id]}</span>
              </Link>
            ))}
          </nav>

          {tab === "tests" && <TestsTab s={s} />}
          {tab === "mocks" && <MocksTab s={s} />}
          {tab === "writing" && <WritingTab s={s} />}
          {tab === "money" && <MoneyTab s={s} />}
          {tab === "support" && <SupportTab s={s} />}
        </div>

        <div className="space-y-4">
          <Panel title="Manage" description="Same actions as the bulk Members tools">
            <StudentActions
              id={p.id}
              email={p.email}
              name={p.name}
              level={p.level}
              hidden={p.hidden_from_leaderboard}
              hasAvatar={!!p.avatar_url}
              premiumActive={s.membership.stage === "active" || s.membership.stage === "expiring"}
              ultimaActive={!!s.ultima?.active}
            />
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- tabs

function Table({ head, children }: { head: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full text-[13px]">
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            {head.map((h, i) => (
              <th key={i} className={cn("px-3 py-2 font-medium", i === 0 ? "text-left" : "text-left")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-border [&>tr:last-child]:border-0 [&_td]:px-3 [&_td]:py-2">
          {children}
        </tbody>
      </table>
    </div>
  );
}

const when = (iso: string | null) => (iso ? iso.slice(0, 16).replace("T", " ") : "—");
const mins = (sec: number | null) => (sec == null ? "—" : `${Math.round(sec / 60)} min`);

function TestsTab({ s }: { s: S360 }) {
  if (s.results.length === 0) return <Empty>No tests taken yet.</Empty>;
  return (
    <div className="space-y-2">
      {s.resultsTotal > s.results.length && (
        <p className="text-xs text-muted">Showing the newest {s.results.length} of {s.resultsTotal}.</p>
      )}
      <Table head={["Test", "Skill", "Score", "Band", "Time", "Rating", "Submitted", ""]}>
        {s.results.map((r) => (
          <tr key={r.id}>
            <td className="max-w-72 truncate font-medium">{r.title}</td>
            <td className="capitalize text-muted">{r.skill}</td>
            <td className="tabular-nums">
              {r.raw ?? "—"}/{r.total ?? "—"}
            </td>
            <td className="tabular-nums font-medium">{r.band ?? "—"}</td>
            <td className="tabular-nums text-muted">{mins(r.duration_seconds)}</td>
            <td className="tabular-nums">
              {r.flagged ? (
                <Badge tone="danger" >
                  <Flag className="h-3 w-3" /> {r.flag_reason ?? "flagged"}
                </Badge>
              ) : r.rated && r.rating_delta != null ? (
                <span className={r.rating_delta >= 0 ? "text-success" : "text-danger"}>
                  {r.rating_delta >= 0 ? "+" : "−"}
                  {Math.abs(r.rating_delta)}
                </span>
              ) : (
                <span className="text-muted">practice</span>
              )}
            </td>
            <td className="whitespace-nowrap tabular-nums text-muted">{when(r.submitted_at)}</td>
            <td>
              <Link href={`/review/${r.id}`} className="text-xs font-medium text-primary hover:underline">
                Review
              </Link>
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}

function MocksTab({ s }: { s: S360 }) {
  if (s.mocks.length === 0) return <Empty>No mock exam places.</Empty>;
  return (
    <Table head={["Mock", "Status", "L", "R", "W", "Overall", "Submitted", ""]}>
      {s.mocks.map((m) => (
        <tr key={m.id}>
          <td className="font-medium">{m.title}</td>
          <td>
            <Badge tone={m.status === "released" ? "success" : m.status === "submitted" ? "warning" : "neutral"}>
              {m.status.replace("_", " ")}
            </Badge>
          </td>
          <td className="tabular-nums">{m.listening_band ?? "—"}</td>
          <td className="tabular-nums">{m.reading_band ?? "—"}</td>
          <td className="tabular-nums">{m.writing_band ?? "—"}</td>
          <td className="tabular-nums font-medium">{m.overall_band ?? "—"}</td>
          <td className="whitespace-nowrap tabular-nums text-muted">{when(m.submitted_at)}</td>
          <td>
            <Link href={`/admin/mocks/attempts/${m.id}`} className="text-xs font-medium text-primary hover:underline">
              Open
            </Link>
          </td>
        </tr>
      ))}
    </Table>
  );
}

function WritingTab({ s }: { s: S360 }) {
  return (
    <div className="space-y-4">
      <h3 className="text-[13px] font-semibold">Writing practice</h3>
      {s.writing.length === 0 ? (
        <Empty>No writing practice.</Empty>
      ) : (
        <Table head={["Kind", "Topic", "Words", "Started", "Submitted", ""]}>
          {s.writing.map((w) => (
            <tr key={w.id}>
              <td className="capitalize">{w.kind === "full" ? "Full test" : w.kind.replace("task", "Task ")}</td>
              <td className="capitalize text-muted">{w.topic?.replace(/_/g, " ") ?? "—"}</td>
              <td className="tabular-nums">
                {w.word_count ?? 0}
                {w.kind === "full" && ` + ${w.word_count2 ?? 0}`}
              </td>
              <td className="whitespace-nowrap tabular-nums text-muted">{when(w.started_at)}</td>
              <td className="whitespace-nowrap tabular-nums">
                {w.submitted_at ? when(w.submitted_at) : <Badge>draft</Badge>}
              </td>
              <td>
                <Link href={`/admin/writing-practice/attempts/${w.id}`} className="text-xs font-medium text-primary hover:underline">
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </Table>
      )}
      <h3 className="text-[13px] font-semibold">Speaking</h3>
      {s.speaking.length === 0 ? (
        <Empty>No speaking submissions.</Empty>
      ) : (
        <Table head={["Topic", "Score", "When"]}>
          {s.speaking.map((x) => (
            <tr key={x.id}>
              <td>{x.topic ?? "—"}</td>
              <td className="tabular-nums">{x.score ?? "—"}</td>
              <td className="whitespace-nowrap tabular-nums text-muted">{when(x.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function MoneyTab({ s }: { s: S360 }) {
  const paid = s.orders.filter((o) => o.status === "paid" && !o.refunded_at).reduce((a, o) => a + o.amount, 0);
  return (
    <div className="space-y-4">
      <p className="text-[13px]">
        Paid online: <b className="tabular-nums">{formatUzs(paid)}</b>
        <span className="text-muted"> · Premium given by hand does not appear here.</span>
      </p>
      <h3 className="text-[13px] font-semibold">Orders</h3>
      {s.orders.length === 0 ? (
        <Empty>No online orders.</Empty>
      ) : (
        <Table head={["Plan", "Amount", "Provider", "Status", "Created", "Paid"]}>
          {s.orders.map((o) => (
            <tr key={o.id}>
              <td className="capitalize">
                {o.plan} · {o.months} mo
              </td>
              <td className="tabular-nums">{formatUzs(o.amount)}</td>
              <td className="capitalize">{o.provider}</td>
              <td>
                <Badge tone={o.refunded_at ? "danger" : o.status === "paid" ? "success" : o.status === "cancelled" ? "neutral" : "warning"}>
                  {o.refunded_at ? "refunded" : o.status}
                </Badge>
              </td>
              <td className="whitespace-nowrap tabular-nums text-muted">{when(o.created_at)}</td>
              <td className="whitespace-nowrap tabular-nums text-muted">{when(o.paid_at)}</td>
            </tr>
          ))}
        </Table>
      )}
      <h3 className="text-[13px] font-semibold">Free passes used</h3>
      {s.passes.length === 0 ? (
        <Empty>No passes claimed.</Empty>
      ) : (
        <Table head={["Test", "Week of", "Claimed"]}>
          {s.passes.map((x) => (
            <tr key={x.test_id}>
              <td className="font-medium">{x.title}</td>
              <td className="tabular-nums text-muted">{x.week_start}</td>
              <td className="whitespace-nowrap tabular-nums text-muted">{when(x.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}

function SupportTab({ s }: { s: S360 }) {
  return (
    <div className="space-y-4">
      <h3 className="text-[13px] font-semibold">Problem reports</h3>
      {s.reports.length === 0 ? (
        <Empty>No problem reports.</Empty>
      ) : (
        <Table head={["Test", "Kind", "Message", "Status", "When"]}>
          {s.reports.map((r) => (
            <tr key={r.id}>
              <td className="max-w-48 truncate font-medium">{r.title}</td>
              <td className="text-muted">{r.category.replace("_", " ")}</td>
              <td className="max-w-80 truncate" title={r.message}>
                {r.message}
              </td>
              <td>
                <Badge tone={r.status === "open" ? "warning" : r.status === "fixed" ? "success" : "neutral"}>
                  {r.status}
                  {r.rewarded && " · +50 XP"}
                </Badge>
              </td>
              <td className="whitespace-nowrap tabular-nums text-muted">{when(r.created_at)}</td>
            </tr>
          ))}
        </Table>
      )}
      <h3 className="text-[13px] font-semibold">Reminder emails</h3>
      {s.emails.length === 0 ? (
        <Empty>No reminder emails sent.</Empty>
      ) : (
        <Table head={["Kind", "Day", "Status"]}>
          {s.emails.map((e, i) => (
            <tr key={i}>
              <td>{e.kind.replace(/_/g, " ")}</td>
              <td className="tabular-nums text-muted">{e.sent_day}</td>
              <td>
                <Badge tone={e.error ? "danger" : "neutral"}>{e.error ? "failed" : e.status}</Badge>
              </td>
            </tr>
          ))}
        </Table>
      )}
    </div>
  );
}
