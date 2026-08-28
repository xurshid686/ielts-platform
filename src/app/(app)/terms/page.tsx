import Link from "next/link";
import { LegalPage, Section, Bullets } from "@/components/legal-page";
import { PREMIUM_TELEGRAM_HANDLE, PREMIUM_TELEGRAM_URL } from "@/lib/site";

export const metadata = {
  title: "Terms of Service",
  description: "The rules for using MockOnline.",
};

const SUPPORT_EMAIL = "aliqulovxurshid24@gmail.com";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="28 August 2026">
      <p>
        These terms cover your use of MockOnline at <strong>mockonline.uz</strong>. By
        creating an account or taking a test, you agree to them.
      </p>

      <Section heading="What the service is">
        <p>
          MockOnline provides IELTS practice material — reading and listening tests
          delivered in an exam-style on-screen player, scored automatically, plus
          speaking practice and progress tracking.
        </p>
        <p>
          It is a <strong>practice tool, not an official IELTS service</strong>. It is not
          affiliated with, endorsed by, or connected to the British Council, IDP, or
          Cambridge Assessment English. Band scores shown here are estimates produced by
          this platform and carry no official standing.
        </p>
      </Section>

      <Section heading="Your account">
        <Bullets
          items={[
            "One account per person. Keep your sign-in details to yourself.",
            "The information you give us should be accurate — particularly your email, since it is how we reach you.",
            "You are responsible for what happens under your account.",
          ]}
        />
      </Section>

      <Section heading="Fair use">
        <p>Please do not:</p>
        <Bullets
          items={[
            "Copy, download in bulk, republish or resell the test material.",
            "Try to extract answer keys, or interfere with how tests are scored.",
            "Automate or script activity to inflate XP, streaks, ratings or leaderboard position.",
            "Attempt to access another user's account, work, or results.",
            "Probe, overload, or disrupt the service or the infrastructure behind it.",
          ]}
        />
        <p>
          Accounts found manipulating scores or rankings may have results invalidated, be
          removed from the leaderboard, or be closed.
        </p>
      </Section>

      <Section heading="Content and ownership">
        <p>
          The practice material, question banks, explanations and the platform itself
          remain the property of their respective owners and are provided for your
          personal study only. The answers, essays and recordings you produce remain
          yours; you grant us permission to store and process them so the service can
          score them, show them back to you, and — where you choose to send work to a
          teacher — deliver them to that teacher.
        </p>
      </Section>

      <Section heading="Premium access">
        <p>
          Some material is Premium. Premium is arranged manually by contacting the
          administrator on Telegram at{" "}
          <a
            className="text-foreground underline"
            href={PREMIUM_TELEGRAM_URL}
            target="_blank"
            rel="noreferrer"
          >
            {PREMIUM_TELEGRAM_HANDLE}
          </a>
          . There is no automated checkout on this site and no card details are collected
          here. Access lasts for the period agreed when it is granted.
        </p>
      </Section>

      <Section heading="Availability">
        <p>
          The service is provided as-is. We aim to keep it running and accurate, but we do
          not guarantee uninterrupted availability, and material may be added, changed or
          withdrawn. Scores and estimated bands may be corrected if a scoring error is
          found.
        </p>
      </Section>

      <Section heading="Limits of liability">
        <p>
          MockOnline is a study aid. Your exam outcome depends on many things outside this
          platform, and we accept no liability for results, decisions or losses arising
          from your use of it. Nothing here excludes liability that cannot be excluded
          under applicable law.
        </p>
      </Section>

      <Section heading="Ending use">
        <p>
          You may stop using the service and request deletion of your account at any time
          — see the{" "}
          <Link className="text-foreground underline" href="/privacy">
            Privacy Policy
          </Link>
          . We may suspend or close accounts that breach these terms.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about these terms:{" "}
          <a className="text-foreground underline" href={`mailto:${SUPPORT_EMAIL}`}>
            {SUPPORT_EMAIL}
          </a>
          .
        </p>
      </Section>
    </LegalPage>
  );
}
