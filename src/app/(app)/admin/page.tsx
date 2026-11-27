import Link from "next/link";
import {
  UserPlus,
  CheckCircle2,
  Crown,
  ClipboardCheck,
  Flag,
  ArrowRight,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { workloadCounts } from "@/lib/mock-admin";
import { enabledProviders } from "@/lib/payments/config";
import { reportStatusCounts } from "@/lib/test-reports";
import { formatUzs } from "@/lib/site";
import { timeAgo, cn } from "@/lib/utils";
import { backlogAges, loadDashboardStats, loadRecentActivity, type ActivityItem } from "@/lib/admin/stats";
import { RANGES, asRange, pct, pctDelta } from "@/lib/admin/stats-shared";
import { Badge, Empty, PageHeader, Panel, Segmented, StatTile } from "@/components/admin/ui/primitives";
import { TimeChart } from "@/components/admin/ui/time-chart";

// Admin overview v2 (owner, 2026-11-27). Every number comes from one
// SECURITY DEFINER aggregate (0076) instead of pulling rows through PostgREST,
// which used to cap the student count at 1000 while the site had ~1,260.

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const days = asRange((await searchParams).days);

  const [stats, work, feed, reports] = await Promise.all([
    loadDashboardStats(days),
    workloadCounts(),
    loadRecentActivity(30),
    reportStatusCounts(),
  ]);
  const ages = backlogAges(stats);
  const providers = enabledProviders();
  const { cur, prev } = stats.period;
  const t = stats.totals;
  const series = stats.series;

  const activation = pct(cur.activated, cur.signups);
  const activationPrev = pct(prev.activated, prev.signups);

  const waiting = [
    { label: "Mock requests", value: work.pending, href: "/admin/mocks?tab=requests" },
    {
      label: "Needs grading",
      value: work.needsGrading,
      href: "/admin/mocks?tab=results&stage=needs_grading",
      age: work.needsGrading > 0 ? ages.grading : null,
    },
    { label: "Ready to release", value: work.readyToRelease, href: "/admin/mocks?tab=results&stage=ready_to_release" },
    {
      label: "Open problem reports",
      value: reports.open,
      href: "/admin/reports",
      age: reports.open > 0 ? ages.reports : null,
    },
    // Orders a student opened but never finished (last 7 days). No page lists
    // them yet; the number is here so a broken checkout is noticed.
    { label: "Unfinished checkouts (7 d)", value: t.orders_stuck, href: null },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overview"
        description={`Last ${days} days, compared with the ${days} days before. Dates in Tashkent time.`}
        actions={
          <Segmented
            label="Period"
            value={String(days)}
            options={RANGES.map((r) => ({ id: String(r), label: `${r} days` }))}
            hrefFor={(id) => `/admin?days=${id}`}
          />
        }
      />

      {/* Work waiting on the owner comes first: both reviewers (Grok, agy)
          named the backlog as the number that matters most. */}
      <Panel title="Waiting on you" bodyClassName="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {waiting.map((w) => {
          const body = (
            <>
              <p className="text-xl font-semibold tabular-nums">{w.value}</p>
              <p className="text-xs text-muted">{w.label}</p>
              {"age" in w && w.age && <p className="mt-0.5 text-[11px] text-muted">oldest waiting {w.age}</p>}
            </>
          );
          const cls = cn(
            "rounded-lg border px-3 py-2.5",
            w.value > 0 ? "border-primary/30 bg-primary/5" : "border-border",
          );
          return w.href ? (
            <Link key={w.label} href={w.href} className={cn(cls, "transition-colors hover:border-primary/40")}>
              {body}
            </Link>
          ) : (
            <div key={w.label} className={cls}>
              {body}
            </div>
          );
        })}
      </Panel>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="New students"
          value={cur.signups.toLocaleString("en-US")}
          delta={pctDelta(cur.signups, prev.signups)}
          hint={`${t.accounts.toLocaleString("en-US")} accounts in all`}
        />
        <StatTile
          label="Activation (test within 7 days)"
          value={`${activation}%`}
          delta={activationPrev > 0 ? activation - activationPrev : null}
          deltaUnit=" pts"
          hint={`${cur.activated} of ${cur.signups} new students`}
        />
        <StatTile
          label="Active students"
          value={cur.active.toLocaleString("en-US")}
          delta={pctDelta(cur.active, prev.active)}
          hint="took at least one test"
        />
        <StatTile
          label="Tests taken"
          value={cur.results.toLocaleString("en-US")}
          delta={pctDelta(cur.results, prev.results)}
          hint={`${t.results_total.toLocaleString("en-US")} all time`}
        />
        <StatTile
          label="Revenue (online)"
          value={formatUzs(Math.round(cur.revenue))}
          delta={pctDelta(cur.revenue, prev.revenue)}
          hint={providers.length ? `${cur.paid} paid orders` : "online payments are switched off"}
        />
        <StatTile
          label="Premium members now"
          value={t.premium_active}
          hint={`${t.premium_expiring_7d} end within 7 days · Ultima ${t.ultima_active}`}
          href="/admin/members?stage=expiring"
        />
        <StatTile
          label="Trials started"
          value={cur.trials}
          delta={pctDelta(cur.trials, prev.trials)}
          hint={`${t.trials_active} running now`}
        />
        <StatTile
          label="Free passes claimed"
          value={cur.passes}
          delta={pctDelta(cur.passes, prev.passes)}
          hint="3 premium tests a week per student"
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <Panel title="New students per day">
          <TimeChart label="New students per day" points={series.map((s) => ({ day: s.day, value: s.signups }))} unit="students" />
        </Panel>
        <Panel title="Active students per day" description="Distinct students who submitted a test">
          <TimeChart
            label="Active students per day"
            kind="line"
            points={series.map((s) => ({ day: s.day, value: s.active }))}
            unit="students"
          />
        </Panel>
        <Panel title="Tests taken per day">
          <TimeChart label="Tests taken per day" points={series.map((s) => ({ day: s.day, value: s.results }))} unit="tests" />
        </Panel>
        <Panel title="Revenue per day" description="Paid Payme / Click orders, so'm">
          <TimeChart label="Revenue per day" points={series.map((s) => ({ day: s.day, value: s.revenue }))} unit="so'm" />
        </Panel>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <Panel
          title="Weekly cohorts"
          description="Students who signed up that week: took a test, came back on another day, ever had Premium"
          bodyClassName="p-0"
        >
          <CohortTable cohorts={stats.cohorts} />
        </Panel>
        <Panel title="Catalogue" description="Regular-track tests by skill and tier" bodyClassName="p-0">
          <CatalogueTable rows={stats.catalogue} total={t.tests_total} />
        </Panel>
      </div>

      <Panel
        title="Live activity"
        description="Newest signups, tests, payments, mock submissions and problem reports"
        bodyClassName="p-0"
      >
        <ActivityFeed items={feed} />
      </Panel>
    </div>
  );
}

function CohortTable({ cohorts }: { cohorts: { week: string; signups: number; took_test: number; returned: number; premium: number }[] }) {
  if (cohorts.length === 0) return <Empty>No signups in the last 8 weeks.</Empty>;
  const cell = (n: number, of: number) => (
    <td className="px-3 py-2 text-right tabular-nums">
      {n} <span className="text-muted">· {pct(n, of)}%</span>
    </td>
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead className="text-xs text-muted">
          <tr className="border-b border-border">
            <th className="px-3 py-2 text-left font-medium">Week of</th>
            <th className="px-3 py-2 text-right font-medium">Signed up</th>
            <th className="px-3 py-2 text-right font-medium">Took a test</th>
            <th className="px-3 py-2 text-right font-medium">Came back</th>
            <th className="px-3 py-2 text-right font-medium">Premium</th>
          </tr>
        </thead>
        <tbody>
          {[...cohorts].reverse().map((c) => (
            <tr key={c.week} className="border-b border-border last:border-0">
              <td className="px-3 py-2">{c.week}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{c.signups}</td>
              {cell(c.took_test, c.signups)}
              {cell(c.returned, c.signups)}
              {cell(c.premium, c.signups)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CatalogueTable({ rows, total }: { rows: { skill: string; tier: string; n: number }[]; total: number }) {
  const skills = [...new Set(rows.map((r) => r.skill))];
  const get = (s: string, t: string) => rows.find((r) => r.skill === s && r.tier === t)?.n ?? 0;
  return (
    <table className="w-full text-[13px]">
      <thead className="text-xs text-muted">
        <tr className="border-b border-border">
          <th className="px-3 py-2 text-left font-medium">Skill</th>
          <th className="px-3 py-2 text-right font-medium">Free</th>
          <th className="px-3 py-2 text-right font-medium">Premium</th>
        </tr>
      </thead>
      <tbody>
        {skills.map((s) => (
          <tr key={s} className="border-b border-border last:border-0">
            <td className="px-3 py-2 capitalize">{s}</td>
            <td className="px-3 py-2 text-right tabular-nums">{get(s, "free")}</td>
            <td className="px-3 py-2 text-right tabular-nums">{get(s, "premium")}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3} className="px-3 py-2 text-xs text-muted">
            {total} tests in the database, including Pre-IELTS, Intro, Discipline and Mock papers.{" "}
            <Link href="/admin/tests" className="text-primary hover:underline">
              Manage tests
            </Link>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

const KIND: Record<ActivityItem["kind"], { icon: React.ComponentType<{ className?: string }>; label: string; tone: "neutral" | "primary" | "success" | "premium" | "warning" }> = {
  signup: { icon: UserPlus, label: "Signed up", tone: "neutral" },
  result: { icon: CheckCircle2, label: "Test", tone: "primary" },
  payment: { icon: Crown, label: "Payment", tone: "premium" },
  mock: { icon: ClipboardCheck, label: "Mock", tone: "success" },
  report: { icon: Flag, label: "Report", tone: "warning" },
};

function ActivityFeed({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) return <Empty>Nothing yet.</Empty>;
  return (
    <ul className="divide-y divide-border">
      {items.map((a, i) => {
        const k = KIND[a.kind] ?? KIND.signup;
        const Icon = k.icon;
        const target =
          a.kind === "mock" && a.ref_id
            ? `/admin/mocks/attempts/${a.ref_id}`
            : a.kind === "report"
              ? "/admin/reports"
              : a.kind === "result" && a.ref_id
                ? `/review/${a.ref_id}`
                : null;
        return (
          <li key={`${a.kind}-${a.ref_id ?? a.user_id}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
            <Icon className="h-4 w-4 shrink-0 text-muted" />
            <Badge tone={k.tone} className="w-16 justify-center">
              {k.label}
            </Badge>
            <div className="min-w-0 flex-1 text-[13px]">
              {a.user_id ? (
                <Link href={`/admin/members/${a.user_id}`} className="font-medium hover:text-primary hover:underline">
                  {a.name || "Unnamed student"}
                </Link>
              ) : (
                <span className="font-medium text-muted">{a.name || "Deleted account"}</span>
              )}
              {a.label && (
                <>
                  <span className="text-muted"> · </span>
                  {target ? (
                    <Link href={target} className="hover:underline">
                      {a.label}
                    </Link>
                  ) : (
                    <span>{a.label}</span>
                  )}
                </>
              )}
              {a.detail && <span className="text-muted"> · {a.detail}</span>}
            </div>
            <time className="shrink-0 text-xs text-muted tabular-nums" dateTime={a.at}>
              {timeAgo(a.at)}
            </time>
            {target && (
              <Link href={target} aria-label="Open" className="text-muted hover:text-foreground">
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
