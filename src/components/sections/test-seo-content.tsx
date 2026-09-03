import { BookOpen, KeyRound, Lightbulb, HelpCircle } from "lucide-react";
import { formatAnswer, questionOrder, type TestSeoData } from "@/lib/seo/test-seo-data";
import type { SeoTest } from "@/lib/seo";
import { faqForTest } from "@/lib/seo";

/**
 * The indexable body of a test page: the passage, the answer key, the worked
 * explanations and an FAQ.
 *
 * WHY IT EXISTS
 * -------------
 * The page above this used to be the whole page — 103 words of card and a
 * button. Students search "<passage name> ielts reading answers", and a page
 * with no passage and no answers on it cannot match that however good its
 * <title> is. This is the content that does.
 *
 * A pure server component on purpose: every word must be in the first HTML
 * response. Anything rendered on the client is invisible to the crawl that
 * matters, which is the entire point of the section.
 *
 * SPOILERS
 * --------
 * The answers sit inside `<details>`, closed. Google indexes content inside a
 * closed `<details>` — it is in the DOM, not injected later — but a student who
 * came to sit the test does not get the key thrown at them above the "Start
 * test" button. `<details>` also needs no JavaScript, so it works on the first
 * paint and inside the no-JS crawl.
 */
export function TestSeoContent({
  test,
  data,
}: {
  test: SeoTest;
  data: TestSeoData;
}) {
  const order = questionOrder(data.answerKey);
  const explained = order.filter((q) => data.explanations[q]);
  const isReading = test.skill === "reading";
  const faqs = faqForTest(test, { hasAnswers: order.length > 0 });

  // Nothing to add — render nothing rather than a run of empty headings.
  if (!data.passages.length && !order.length) return null;

  return (
    <div className="mx-auto mt-10 max-w-3xl space-y-10 pb-4">
      {data.passages.length > 0 && (
        <section aria-labelledby="passage-heading">
          <SectionHeading id="passage-heading" icon={<BookOpen className="h-4 w-4" />}>
            {isReading
              ? data.passages.length > 1
                ? "Reading passages"
                : "Reading passage"
              : "Audio transcript"}
          </SectionHeading>

          {data.passages.map((p, i) => (
            <article key={i} className="mt-6">
              {/* A full test's three passages each carry their own name, and
                  those names — not "Volume 7, Test 1" — are what students
                  search for, so each gets a real heading of its own.

                  A SINGLE passage is named after the test, so printing its
                  title here repeated the page's <h1> word for word two inches
                  below it. Suppressed in that case. */}
              {p.title && !isSameName(p.title, test.title) ? (
                <h3 className="mb-3 text-lg font-bold leading-snug">
                  {data.passages.length > 1 && isReading ? `Passage ${i + 1}: ` : ""}
                  {p.title}
                </h3>
              ) : null}
              <div
                className="prose-passage space-y-4 text-[15px] leading-relaxed text-foreground/90"
                dangerouslySetInnerHTML={{ __html: p.html }}
              />
            </article>
          ))}
        </section>
      )}

      {order.length > 0 && (
        <section aria-labelledby="answers-heading">
          <SectionHeading id="answers-heading" icon={<KeyRound className="h-4 w-4" />}>
            {test.title} — answers
          </SectionHeading>
          <p className="mt-2 text-sm text-muted">
            The full answer key for all {order.length} questions. Sit the test first if you want a
            real band score — it is marked automatically.
          </p>

          <details className="group mt-4 rounded-2xl border border-border bg-surface shadow-soft">
            <summary className="cursor-pointer list-none rounded-2xl px-5 py-4 text-sm font-semibold hover:bg-surface-2">
              Show the answer key
              <span className="ml-2 font-normal text-muted group-open:hidden">
                ({order.length} answers — hidden so you can take the test first)
              </span>
            </summary>
            <div className="border-t border-border px-5 py-4">
              <ol className="grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2">
                {order.map((q) => (
                  <li key={q} className="flex gap-3 border-b border-border/50 py-1.5 text-sm">
                    <span className="w-6 shrink-0 tabular-nums text-muted">{q}</span>
                    <span className="font-medium">{formatAnswer(data.answerKey[q])}</span>
                  </li>
                ))}
              </ol>
            </div>
          </details>
        </section>
      )}

      {explained.length > 0 && (
        <section aria-labelledby="explanations-heading">
          <SectionHeading id="explanations-heading" icon={<Lightbulb className="h-4 w-4" />}>
            Answer explanations
          </SectionHeading>
          <p className="mt-2 text-sm text-muted">
            Where the answer is in the {isReading ? "passage" : "recording"}, and why the other
            options are wrong.
          </p>

          <details className="group mt-4 rounded-2xl border border-border bg-surface shadow-soft">
            <summary className="cursor-pointer list-none rounded-2xl px-5 py-4 text-sm font-semibold hover:bg-surface-2">
              Show {explained.length} explanations
            </summary>
            <div className="space-y-5 border-t border-border px-5 py-5">
              {explained.map((q) => {
                const e = data.explanations[q];
                return (
                  <div key={q} className="border-b border-border/50 pb-5 last:border-0 last:pb-0">
                    {/* The dash is a real character, not a margin. Stripped of
                        its tags — which is how a crawler and a screen reader
                        both take this — "Question 1" and "raindrops" ran
                        together into "Question 1raindrops". */}
                    <h3 className="text-sm font-bold">
                      Question {q} —{" "}
                      <span className="font-semibold text-primary">
                        {e.answer ?? formatAnswer(data.answerKey[q])}
                      </span>
                    </h3>
                    {e.evidence ? (
                      <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                        <span className="font-semibold">Where it says so: </span>
                        {e.evidence}
                      </p>
                    ) : null}
                    {e.why ? (
                      <p className="mt-1.5 text-sm leading-relaxed text-muted">
                        <span className="font-semibold">Why not the others: </span>
                        {e.why}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </details>
        </section>
      )}

      {faqs.length > 0 && (
        <section aria-labelledby="faq-heading">
          <SectionHeading id="faq-heading" icon={<HelpCircle className="h-4 w-4" />}>
            Frequently asked questions
          </SectionHeading>
          {/* Open, unlike the sections above: these answers spoil nothing, and
              they are the text that matches a question-phrased search. */}
          <dl className="mt-4 space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-2xl border border-border bg-surface p-5 shadow-soft">
                <dt className="text-sm font-semibold">{f.q}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </div>
  );
}

/**
 * Whether two titles name the same thing.
 *
 * Loose on purpose: the file's own heading and the database title are typed by
 * different people at different times, so they differ in punctuation and case
 * far more often than in substance — "Why don't we sleep?" on the row against
 * "Why don’t we sleep" in the file is one paper, not two.
 */
function isSameName(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return norm(a) === norm(b);
}

function SectionHeading({
  id,
  icon,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-xl font-bold">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      {children}
    </h2>
  );
}
