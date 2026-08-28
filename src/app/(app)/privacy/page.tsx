import Link from "next/link";
import { LegalPage, Section, Bullets } from "@/components/legal-page";
import { PREMIUM_TELEGRAM_HANDLE, PREMIUM_TELEGRAM_URL } from "@/lib/site";

export const metadata = {
  title: "Privacy Policy",
  description: "What MockOnline collects, why, and how to have it deleted.",
};

const SUPPORT_EMAIL = "aliqulovxurshid24@gmail.com";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="28 August 2026">
      <p>
        MockOnline is an IELTS practice platform. This page describes exactly what the
        service stores about you, why it is stored, and how to get it removed. It
        covers the site at <strong>mockonline.uz</strong>.
      </p>

      <Section heading="What we collect">
        <p>Only what the platform needs in order to work:</p>
        <Bullets
          items={[
            <>
              <strong>Your account.</strong> Email address, and — if you sign in with
              Google — the display name and profile picture Google provides. We never
              receive your Google password.
            </>,
            <>
              <strong>Your practice.</strong> The answers you submit for each reading and
              listening test, the resulting score and band, and how long the attempt
              took. This is what makes the review screen and your progress charts
              possible.
            </>,
            <>
              <strong>Your progress.</strong> XP, streak, rating, badges, and the date of
              your last activity.
            </>,
            <>
              <strong>Your timezone.</strong> Detected from your browser, so that streaks
              and weekly reports roll over at midnight where you actually are.
            </>,
            <>
              <strong>Speaking and writing submissions</strong>, where you choose to make
              them — including audio recordings you record in the browser.
            </>,
          ]}
        />
        <p>
          We do not collect payment details. Premium access is arranged manually and no
          card information ever reaches this site.
        </p>
      </Section>

      <Section heading="How it is used">
        <Bullets
          items={[
            "Grading your tests on the server and showing you the result.",
            "Building your dashboard, progress history and weekly report.",
            "Ranking on the leaderboard, if you are visible on it.",
            "Letting your teacher see work you explicitly send to them.",
          ]}
        />
        <p>
          Your work is not sold, rented, or used for advertising. There is no advertising
          on this site and no third-party tracking or analytics scripts.
        </p>
      </Section>

      <Section heading="Services we rely on">
        <p>
          The platform is built on a small number of providers, each of which processes
          some of your data on our behalf:
        </p>
        <Bullets
          items={[
            <>
              <strong>Supabase</strong> — hosts the database, your account and sign-in
              session, and stored files.
            </>,
            <>
              <strong>DigitalOcean</strong> — hosts and serves the application itself.
            </>,
            <>
              <strong>Google</strong> — provides &ldquo;Sign in with Google&rdquo;, and,
              where you use AI speaking feedback, receives that recording in order to
              produce the feedback.
            </>,
            <>
              <strong>Telegram</strong> — used only when you choose to send a piece of
              work to your teacher; the submission is delivered to your teacher through
              a bot.
            </>,
          ]}
        />
      </Section>

      <Section heading="Cookies">
        <p>
          The site sets a session cookie so that you stay signed in between pages. That is
          its only purpose. There are no advertising or tracking cookies. Clearing it, or
          signing out, ends the session.
        </p>
      </Section>

      <Section heading="How long it is kept">
        <p>
          Your account and practice history are kept for as long as your account exists,
          because your progress charts and history are the point of having one. When an
          account is deleted, its profile, results, submissions and recordings are deleted
          with it.
        </p>
      </Section>

      <Section heading="Your choices">
        <Bullets
          items={[
            <>
              <strong>See your data.</strong> Your attempts and scores are visible in your
              dashboard and in each test&rsquo;s review page.
            </>,
            <>
              <strong>Leave the leaderboard.</strong> Ask and we will hide your profile
              from public rankings.
            </>,
            <>
              <strong>Delete everything.</strong> Ask for deletion and your account and
              all associated work will be removed. This cannot be undone.
            </>,
          ]}
        />
      </Section>

      <Section heading="Children">
        <p>
          IELTS candidates are typically teenagers or adults. If you are under 16, please
          use this site only with a parent, guardian or teacher&rsquo;s involvement.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          For any privacy question, or to have your account and data deleted, contact{" "}
          <a className="text-foreground underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>{" "}
          or message{" "}
          <a
            className="text-foreground underline"
            href={PREMIUM_TELEGRAM_URL}
            target="_blank"
            rel="noreferrer"
          >
            {PREMIUM_TELEGRAM_HANDLE}
          </a>{" "}
          on Telegram. See also our{" "}
          <Link className="text-foreground underline" href="/terms">
            Terms of Service
          </Link>
          .
        </p>
      </Section>

      <Section heading="Changes">
        <p>
          If this policy changes in a way that affects what we collect or who receives it,
          the date at the top of this page will change and the update will be described
          here.
        </p>
      </Section>
    </LegalPage>
  );
}
