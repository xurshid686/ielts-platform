import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronDown,
  Crown,
  Flame,
  Mail,
  Send,
  Target,
  Trophy,
  UserPlus,
  Users,
} from "lucide-react";
import { getProfile } from "@/lib/auth";
import { groupOf } from "@/lib/friends";
import { enabledProviders } from "@/lib/payments/config";
import { FRIENDS_PLANS, FRIENDS_SEATS, PREMIUM_TELEGRAM_HANDLE, formatUzs, perPerson } from "@/lib/site";
import { FriendsBuy } from "@/components/premium/friends-buy";

const PRICES = FRIENDS_PLANS.map((p) => `${formatUzs(p.priceUzs)} for ${p.label}`).join(" or ");

export const metadata = {
  title: "Friends plan: Premium for 4",
  description: `Premium for you and ${FRIENDS_SEATS - 1} friends: ${PRICES}. Invite friends, practise together, reach a weekly goal and climb the group leaderboard.`,
  alternates: { canonical: "/premium/friends" },
};

/**
 * How the Friends plan works (owner, 2026-11-27: "describe friends plan a little
 * more with screenshots"). Public, like /premium. The screenshots in
 * public/friends/ come from scripts/friends-screenshots.mjs (a demo group).
 */
export default async function FriendsGuidePage({
  searchParams,
}: {
  searchParams: Promise<{ buy?: string; months?: string }>;
}) {
  const profile = await getProfile();
  const sp = await searchParams;
  const inGroup = profile ? !!(await groupOf(profile.id)) : false;
  const providers = enabledProviders();
  const initialMonths = sp.buy === "friends" ? Number(sp.months) || 3 : null;
  const three = FRIENDS_PLANS.find((p) => p.months === 3) ?? FRIENDS_PLANS[0];
  const buyProps = {
    signedIn: !!profile,
    email: profile?.email ?? null,
    isAdmin: profile?.role === "admin",
    inGroup,
    providers,
  };

  return (
    <div className="mx-auto max-w-5xl space-y-16 py-4">
      <Link href="/premium" className="inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> All plans
      </Link>

      {/* Hero */}
      <section className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-5">
          <p className="inline-flex items-center gap-2 rounded-full bg-premium/10 px-3 py-1 text-sm font-semibold text-premium">
            <Users className="h-4 w-4" /> Friends plan · up to {FRIENDS_SEATS} people
          </p>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
            Premium for you and {FRIENDS_SEATS - 1} friends
          </h1>
          <p className="max-w-xl text-lg text-muted">
            One person buys, everyone gets every Premium IELTS test. Invite your friends, see who practised most this
            week, reach a goal together and climb the group leaderboard. Just {perPerson(three)} per person for 3 months.
          </p>
          <FriendsBuy {...buyProps} initialMonths={initialMonths} />
        </div>
        <Shot src="/friends/friends.jpg" w={1048} h={646} alt="A Friends group: each friend's rating, streak and points this week" />
      </section>

      {/* Steps */}
      <section aria-labelledby="how" className="space-y-12">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Step by step</p>
          <h2 id="how" className="mt-1 text-3xl font-bold">How it works</h2>
        </div>

        <Step
          n={1}
          icon={<Crown className="h-5 w-5" />}
          title="Get Friends"
          text={
            <>
              Press <b>Get Friends</b> and choose 1 or 3 months. You message our admin {PREMIUM_TELEGRAM_HANDLE} on
              Telegram, pay, and we switch your group on. You get Premium straight away and become the group&apos;s
              buyer.
            </>
          }
          points={["No card needed: pay the way the admin tells you", "One payment, nothing renews by itself"]}
        />

        <Step
          n={2}
          icon={<UserPlus className="h-5 w-5" />}
          title={`Name your group and invite ${FRIENDS_SEATS - 1} friends`}
          text={
            <>
              Open <b>My Friends group</b>. Give it a name (it shows on the group leaderboard), then find a friend by
              name or email and press <b>Invite</b>, or copy your invite link and send it on Telegram. You always see
              how many invitations were accepted.
            </>
          }
          points={["An invitation holds a seat for 7 days", "Cancel an invitation any time to free the seat"]}
          shot={{ src: "/friends/invite.jpg", w: 1048, h: 598, alt: "Seats: 2 of 3 invitations accepted, 1 waiting" }}
        />

        <Step
          n={3}
          icon={<Mail className="h-5 w-5" />}
          title="Your friends accept"
          text={
            <>
              An invited friend gets a notification on the site, an email and (if they use our bot) a Telegram message.
              They press <b>Accept</b> and get Premium until your group&apos;s end date. A friend without an account
              signs up for free from your link first.
            </>
          }
          points={["Everyone keeps their own account, results and rating", "Someone who already has a longer Premium keeps it"]}
          shot={{ src: "/friends/accept.jpg", w: 1536, h: 156, alt: "The invitation on a friend's dashboard with Accept and Decline" }}
        />

        <Step
          n={4}
          icon={<Flame className="h-5 w-5" />}
          title="Practise together"
          text={
            <>
              Your group page shows every friend&apos;s ratings, streak and points this week, and what everyone
              practised. Reach the <b>weekly goal</b> (5 tests each) and everyone gets <b>+100 XP</b>. Friend
              hasn&apos;t practised today? Send a <b>Nudge</b>.
            </>
          }
          points={["Each test counts once per person for the goal", "A nudge can be sent once a day; anyone can turn nudges off"]}
          shot={{ src: "/friends/goal-feed.jpg", w: 698, h: 1354, alt: "Weekly goal 12 of 15 tests, and the group's activity", narrow: true }}
        />

        <Step
          n={5}
          icon={<Trophy className="h-5 w-5" />}
          title="Climb the group leaderboard"
          text={
            <>
              On the <b>Groups</b> tab of the leaderboard, groups are ranked by points per member this week, so a group
              of 2 can beat a group of 4. Switch to <b>Average rating</b> to compare skill.
            </>
          }
          points={["The weekly ranking resets every Monday"]}
          shot={{ src: "/friends/leaderboard.jpg", w: 1598, h: 272, alt: "Band 7 Club, first on the Groups leaderboard" }}
        />
      </section>

      {/* What everyone gets + rules */}
      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
          <h2 className="text-xl font-bold">What everyone in the group gets</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              "Every premium reading and listening test",
              "A mock exam place instantly",
              "10 AI writing checks a month",
              "Their own progress, ratings and streak",
              "The group page, weekly goal and leaderboard",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-premium" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-soft">
          <h2 className="text-xl font-bold">Good to know</h2>
          <ul className="mt-4 space-y-2.5 text-sm">
            {[
              "A person can be in one Friends group at a time.",
              "The buyer can remove a friend only if they haven't taken a test since joining.",
              "Friends can leave any time; their group Premium then ends.",
              "Buying again adds time for the whole group.",
              "Nothing renews automatically.",
            ].map((t) => (
              <li key={t} className="flex gap-2.5">
                <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq" className="mx-auto max-w-3xl">
        <h2 id="faq" className="text-center text-2xl font-bold">
          Questions
        </h2>
        <div className="mt-6 space-y-2">
          <Faq q="How much does it cost?">
            {PRICES} for the whole group of {FRIENDS_SEATS}. That&apos;s {perPerson(three)} per person for 3 months.
          </Faq>
          <Faq q="My friend already has Premium. What happens?">
            They keep whichever date is later: their own Premium or the group&apos;s end date. Nobody loses days.
          </Faq>
          <Faq q="Can we swap a friend?">
            If a friend hasn&apos;t taken any test since joining, the buyer can remove them and invite someone else. A
            friend can also leave the group themselves.
          </Faq>
          <Faq q="Does my friend need an account?">
            Yes, a free one. Send them your invite link: they sign up and come straight back to join.
          </Faq>
          <Faq q="What happens when the group ends?">
            Everyone keeps their account, results and ratings. The full library closes until the buyer renews, which
            adds time for the whole group.
          </Faq>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="rounded-3xl bg-brand-gradient p-8 text-center text-white shadow-elevated">
        <h2 className="text-2xl font-bold">Practising is easier together</h2>
        <p className="mx-auto mt-2 max-w-lg text-white/85">Start a group, invite your friends, and race to the weekly goal.</p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <FriendsBuy {...buyProps} initialMonths={null} compact />
          <a
            href="https://t.me/ListeningReadingTests"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-5 py-3 text-sm font-semibold hover:bg-white/25"
          >
            <Send className="h-4 w-4" /> Ask a question
          </a>
        </div>
      </section>
    </div>
  );
}

function Shot({ src, w, h, alt, narrow = false }: { src: string; w: number; h: number; alt: string; narrow?: boolean }) {
  return (
    <figure className={narrow ? "mx-auto w-full max-w-xs" : "w-full"}>
      <div className="overflow-hidden rounded-2xl border border-border bg-surface p-2 shadow-elevated">
        <Image src={src} width={w} height={h} alt={alt} className="h-auto w-full rounded-xl" sizes="(min-width: 1024px) 560px, 100vw" />
      </div>
    </figure>
  );
}

function Step({
  n,
  icon,
  title,
  text,
  points,
  shot,
}: {
  n: number;
  icon: React.ReactNode;
  title: string;
  text: React.ReactNode;
  points: string[];
  shot?: { src: string; w: number; h: number; alt: string; narrow?: boolean };
}) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2" data-step={n}>
      <div className={n % 2 === 0 && shot ? "lg:order-2" : undefined}>
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-premium-gradient font-bold text-white">
            {n}
          </span>
          <span className="text-premium">{icon}</span>
        </div>
        <h3 className="mt-3 text-2xl font-bold">{title}</h3>
        <p className="mt-2 text-muted">{text}</p>
        <ul className="mt-4 space-y-1.5 text-sm">
          {points.map((p) => (
            <li key={p} className="flex gap-2">
              <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {p}
            </li>
          ))}
        </ul>
      </div>
      {shot ? (
        <Shot {...shot} />
      ) : (
        <div className="hidden rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted lg:block">
          <Send className="mx-auto mb-2 h-6 w-6 text-[#229ED9]" />
          Get Friends → message {PREMIUM_TELEGRAM_HANDLE} → pay → your group is on.
        </div>
      )}
    </div>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl border border-border bg-surface px-5 py-4 shadow-soft">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
        {q}
        <ChevronDown className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
      </summary>
      <p className="mt-3 text-sm text-muted">{children}</p>
    </details>
  );
}
