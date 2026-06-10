import { Gift, Crown, UserPlus, CheckCircle2, Share2, Trophy, Clock } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isPremiumActive } from "@/lib/premium";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { InviteCard } from "@/components/referral/invite-card";
import type { Referral } from "@/types/database";

export const metadata = { title: "Invite friends · IELTS Practice" };

export default async function ReferPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  // Degrades gracefully if migration 0019 hasn't been applied yet.
  let referrals: Pick<Referral, "status" | "reward_months" | "created_at" | "qualified_at">[] = [];
  try {
    const { data } = await supabase
      .from("referrals")
      .select("status, reward_months, created_at, qualified_at")
      .eq("referrer_id", profile.id)
      .order("created_at", { ascending: false });
    referrals = (data ?? []) as typeof referrals;
  } catch {
    /* table not present yet */
  }

  const invited = referrals.length;
  const qualified = referrals.filter((r) => r.status === "qualified");
  const pending = invited - qualified.length;
  const monthsEarned = qualified.reduce((a, r) => a + (r.reward_months || 1), 0);
  const premium = isPremiumActive(profile);

  return (
    <div className="space-y-8">
      <div className="animate-fade-in-up">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight sm:text-3xl">
          <Gift className="h-7 w-7 text-primary" /> Invite friends, earn Premium
        </h1>
        <p className="mt-1 text-muted">
          Share your link. When a friend joins and completes their first test, you get a free month
          of Premium. There&apos;s no limit — invite as many as you like.
        </p>
      </div>

      {/* Hero: how the reward works */}
      <div className="relative overflow-hidden rounded-2xl bg-brand-gradient p-6 text-white shadow-elevated">
        <div className="ring-hairline absolute inset-0 rounded-2xl" />
        <div className="orb -right-12 -top-16 h-48 w-48 bg-white/15" />
        <div className="relative grid gap-5 sm:grid-cols-3">
          <Step n="1" icon={<Share2 className="h-5 w-5" />} title="Share your link" desc="Send it on Telegram or anywhere your friends are." />
          <Step n="2" icon={<UserPlus className="h-5 w-5" />} title="They join & test" desc="Your friend signs up and completes their first test." />
          <Step n="3" icon={<Crown className="h-5 w-5" />} title="You get Premium" desc="A free month is added to your account automatically." />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat icon={<UserPlus className="text-primary" />} label="Invited" value={`${invited}`} />
        <Stat icon={<CheckCircle2 className="text-success" />} label="Completed" value={`${qualified.length}`} />
        <Stat icon={<Clock className="text-warning" />} label="In progress" value={`${pending}`} />
        <Stat icon={<Trophy className="text-amber-500" />} label="Months earned" value={`${monthsEarned}`} />
      </div>

      {/* The invite link */}
      <Card>
        <h2 className="text-lg font-semibold">Your invite link</h2>
        <p className="mb-4 mt-1 text-sm text-muted">
          New friends who sign up through this link are tied to you automatically.
        </p>
        {profile.referral_code ? (
          <InviteCard code={profile.referral_code} />
        ) : (
          <p className="rounded-lg border border-dashed border-border bg-surface-2/50 px-4 py-6 text-center text-sm text-muted">
            Your invite link is being set up. Check back in a moment.
          </p>
        )}
      </Card>

      {/* Current premium status */}
      {premium && profile.premium_until && (
        <Card className="flex items-center gap-3 border-amber-500/30 bg-amber-500/5">
          <Crown className="h-5 w-5 shrink-0 text-amber-500" />
          <p className="text-sm">
            Your Premium is active until{" "}
            <strong>{new Date(profile.premium_until).toLocaleDateString()}</strong>. Every qualified
            invite extends it by a month.
          </p>
        </Card>
      )}

      {/* Invitee list */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Your invites</h2>
        {invited === 0 ? (
          <EmptyState
            icon={<Gift />}
            title="No invites yet"
            desc="Share your link above to get started. Your invited friends will appear here as they join."
          />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-border">
              {referrals.map((r, i) => {
                const done = r.status === "qualified";
                return (
                  <li key={i} className="flex items-center justify-between px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-full ${
                          done ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                        }`}
                      >
                        {done ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
                      </span>
                      <div>
                        <p className="text-sm font-medium">
                          {done ? "Completed first test" : "Joined — yet to test"}
                        </p>
                        <p className="text-xs text-muted">
                          {new Date(r.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    {done ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
                        <Crown className="h-3.5 w-3.5" /> +{r.reward_months || 1} month
                      </span>
                    ) : (
                      <span className="text-xs font-medium text-muted">Pending</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

function Step({
  n,
  icon,
  title,
  desc,
}: {
  n: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="relative flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
          {icon}
        </span>
        <span className="text-2xl font-extrabold text-white/40">{n}</span>
      </div>
      <p className="font-semibold">{title}</p>
      <p className="text-sm text-white/80">{desc}</p>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="flex flex-col justify-center">
      <div className="flex items-center gap-2 text-muted">
        <span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <p className="mt-1.5 text-2xl font-bold tabular-nums">{value}</p>
    </Card>
  );
}
