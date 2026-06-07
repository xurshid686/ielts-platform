// Canonical IELTS question types, used both to tag a test on upload and to
// filter tests on the skill pages.

export const QUESTION_TYPES: Record<"reading" | "listening", string[]> = {
  reading: [
    "Multiple choice",
    "True/False/Not Given",
    "Yes/No/Not Given",
    "Matching headings",
    "Matching information",
    "Matching features",
    "Matching sentence endings",
    "Sentence completion",
    "Summary completion",
    "Note/Table/Flow-chart completion",
    "Diagram label completion",
    "Short-answer questions",
  ],
  listening: [
    "Multiple choice",
    "Matching",
    "Plan/Map/Diagram labelling",
    "Form completion",
    "Note completion",
    "Table completion",
    "Flow-chart completion",
    "Sentence completion",
    "Short-answer questions",
  ],
};
