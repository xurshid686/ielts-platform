import { Lightbulb, BookA, MessageSquareQuote, GraduationCap } from "lucide-react";
import type { SpeakingQuestion } from "@/types/database";
import { AnswerRecorder } from "@/components/speaking/answer-recorder";

/** Render text with **double asterisk** spans highlighted as key language. */
function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <mark
            key={i}
            className="rounded bg-primary/15 px-1 font-medium text-primary"
          >
            {p.slice(2, -2)}
          </mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function TopicPractice({
  question,
  canSendToTeacher,
}: {
  question: SpeakingQuestion;
  canSendToTeacher: boolean;
}) {
  const study = question.study;

  if (!study) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted">
        Practice material for this topic is coming soon.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Ideas */}
      {study.ideas.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Lightbulb className="h-5 w-5 text-primary" /> Ideas to talk about
          </h2>
          <ul className="space-y-2">
            {study.ideas.map((idea, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-xl border border-border bg-surface p-4 text-sm"
              >
                <span className="font-semibold text-primary">{i + 1}.</span>
                <span>{idea}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Sample answers — 3+ versions each, with record/replay */}
      {study.samples.length > 0 && (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <MessageSquareQuote className="h-5 w-5 text-primary" /> Natural sample
            answers
          </h2>
          <p className="text-xs text-muted">
            Highlighted words are useful topic vocabulary, expressions and idioms.
            Record your own answer and play it back — practise until it feels natural.
          </p>
          <div className="space-y-5">
            {study.samples.map((s, i) => (
              <div key={i} className="rounded-2xl border border-border bg-surface p-5">
                <p className="font-semibold">{s.prompt}</p>
                <div className="mt-3 space-y-3">
                  {s.versions.map((v, j) => (
                    <div
                      key={j}
                      className="rounded-xl border border-border/70 bg-background/40 p-4"
                    >
                      <span className="mb-1 inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                        Version {j + 1}
                      </span>
                      <p className="text-sm leading-relaxed text-foreground/90">
                        <Highlighted text={v} />
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-4">
                  <AnswerRecorder
                    topicTitle={question.title}
                    prompt={s.prompt}
                    canSendToTeacher={canSendToTeacher}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Vocabulary recap */}
      {study.vocabulary.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <BookA className="h-5 w-5 text-primary" /> Vocabulary
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {study.vocabulary.map((v, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-4">
                <p className="font-semibold text-primary">{v.term}</p>
                <p className="mt-1 text-sm text-muted">{v.meaning}</p>
                <p className="mt-2 text-sm italic text-foreground/80">“{v.example}”</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Grammar recap */}
      {study.grammar.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <GraduationCap className="h-5 w-5 text-primary" /> Grammar
          </h2>
          <div className="space-y-2">
            {study.grammar.map((g, i) => (
              <div key={i} className="rounded-xl border border-border bg-surface p-4">
                <p className="text-sm font-medium">{g.point}</p>
                <p className="mt-1 text-sm italic text-foreground/80">
                  <Highlighted text={g.example} />
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
