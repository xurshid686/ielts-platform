// IELTS Writing prompt bank. Task 1 here uses (text-only) letter prompts and
// Task 2 uses essay prompts, so everything is gradeable without an image.

export type WritingPrompt = {
  id: string;
  task: "task1" | "task2";
  title: string;
  prompt: string;
  minWords: number;
  minutes: number;
};

export const WRITING_PROMPTS: WritingPrompt[] = [
  // ---- Task 2 (essays) ----
  {
    id: "t2-community-service",
    task: "task2",
    title: "Compulsory community service",
    prompt:
      "Some people believe that unpaid community service should be a compulsory part of high school programmes (for example, working for a charity, improving a neighbourhood or teaching sports to younger children).\n\nTo what extent do you agree or disagree?",
    minWords: 250,
    minutes: 40,
  },
  {
    id: "t2-technology-life",
    task: "task2",
    title: "Has technology simplified life?",
    prompt:
      "Some people think that modern technology has made our lives more complicated, while others believe it has made life easier.\n\nDiscuss both views and give your own opinion.",
    minWords: 250,
    minutes: 40,
  },
  {
    id: "t2-online-learning",
    task: "task2",
    title: "Online vs classroom learning",
    prompt:
      "More and more students are choosing to study online rather than in traditional classrooms.\n\nDo the advantages of this development outweigh the disadvantages?",
    minWords: 250,
    minutes: 40,
  },
  // ---- Task 1 (letters) ----
  {
    id: "t1-hotel-complaint",
    task: "task1",
    title: "Complaint to a hotel",
    prompt:
      "You recently stayed at a hotel and were unhappy with the service you received. Write a letter to the hotel manager. In your letter:\n• explain why you were staying at the hotel\n• describe the problems you experienced\n• say what you would like the manager to do",
    minWords: 150,
    minutes: 20,
  },
  {
    id: "t1-friend-visit",
    task: "task1",
    title: "A friend's visit",
    prompt:
      "A friend from another country is going to visit your city for a few days. Write a letter to your friend. In your letter:\n• suggest the best time of year to come\n• recommend things to see and do\n• explain what they should bring",
    minWords: 150,
    minutes: 20,
  },
];

export function getWritingPrompt(id: string): WritingPrompt | undefined {
  return WRITING_PROMPTS.find((p) => p.id === id);
}
