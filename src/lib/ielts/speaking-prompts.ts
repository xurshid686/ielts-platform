// Static IELTS Speaking prompt bank. Each topic is one full test: Part 1
// (short personal questions), Part 2 (a cue card / long turn), and Part 3
// (abstract discussion follow-ups). Used by the 3-part mock runner and the
// server action (to give Gemini the exact questions the audio answers).

export type SpeakingTopic = {
  id: string;
  title: string;
  blurb: string;
  part1: string[];
  part2: { cue: string; bullets: string[] };
  part3: string[];
};

export const SPEAKING_TOPICS: SpeakingTopic[] = [
  {
    id: "hometown",
    title: "Your hometown",
    blurb: "Places, daily life, and how where you live has changed.",
    part1: [
      "Where is your hometown and what is it like?",
      "What do you like most about living there?",
      "Has your hometown changed much in recent years?",
      "Would you like to live there in the future? Why or why not?",
    ],
    part2: {
      cue: "Describe a place in your hometown that you enjoy visiting.",
      bullets: [
        "what the place is",
        "where it is located",
        "what you do there",
        "and explain why you enjoy visiting it",
      ],
    },
    part3: [
      "How do public spaces in cities affect people's quality of life?",
      "Do you think cities are becoming better or worse places to live? Why?",
      "What can governments do to make towns more attractive to young people?",
      "How might hometowns be different for the next generation?",
    ],
  },
  {
    id: "technology",
    title: "Technology & daily life",
    blurb: "Devices, the internet, and how technology shapes routines.",
    part1: [
      "How often do you use a computer or smartphone?",
      "What apps or websites do you use the most?",
      "Has technology made your daily life easier? How?",
      "Is there any technology you would like to learn to use better?",
    ],
    part2: {
      cue: "Describe a piece of technology you find useful.",
      bullets: [
        "what it is",
        "how often you use it",
        "what you use it for",
        "and explain why you find it so useful",
      ],
    },
    part3: [
      "How has technology changed the way people communicate?",
      "Do you think people rely too much on technology nowadays?",
      "What are the downsides of children using devices from a young age?",
      "How might technology change education in the future?",
    ],
  },
  {
    id: "travel",
    title: "Travel & holidays",
    blurb: "Trips, transport, and experiences in new places.",
    part1: [
      "Do you enjoy travelling? Why or why not?",
      "What kinds of places do you like to visit?",
      "Do you prefer travelling alone or with others?",
      "How do you usually plan a trip?",
    ],
    part2: {
      cue: "Describe a memorable journey or trip you have taken.",
      bullets: [
        "where you went",
        "who you went with",
        "what you did there",
        "and explain why it was memorable",
      ],
    },
    part3: [
      "Why do you think people enjoy travelling to other countries?",
      "What are the benefits of experiencing different cultures?",
      "Does tourism always help the places people visit? Why or why not?",
      "How do you think the way people travel will change in the future?",
    ],
  },
];

export function getTopic(id: string): SpeakingTopic | undefined {
  return SPEAKING_TOPICS.find((t) => t.id === id);
}
