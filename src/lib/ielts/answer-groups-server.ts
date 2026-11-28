import "server-only";

import { downloadTestHtml } from "@/lib/tests/access";
import { getCachedTestHtml, setCachedTestHtml } from "@/lib/tests/html-cache";
import { parseAnswerGroups, regroupAnswers, type AnswerKeyLike, type AnswersLike } from "./answer-groups";

// The choose-TWO/THREE groups of a stored paper, read from its own HTML (see answer-groups.ts).
// Keyed by file_path: a path's bytes are fixed at upload, so a group list never goes stale.
// A failed download yields no groups, i.e. grading exactly as before the fix — never an error.
const groupsByPath = new Map<string, number[][]>();
const MAX_ENTRIES = 2000;

export async function answerGroupsFor(filePath: string | null | undefined): Promise<number[][]> {
  if (!filePath) return [];
  const hit = groupsByPath.get(filePath);
  if (hit) return hit;
  let html = getCachedTestHtml(filePath);
  if (html == null) {
    html = await downloadTestHtml(filePath);
    if (html == null) return [];
    setCachedTestHtml(filePath, html);
  }
  const groups = parseAnswerGroups(html);
  if (groupsByPath.size >= MAX_ENTRIES) groupsByPath.delete(groupsByPath.keys().next().value as string);
  groupsByPath.set(filePath, groups);
  return groups;
}

/** The student's answers with each multi-select group re-seated against the key. */
export async function regroupForPaper(key: AnswerKeyLike, answers: AnswersLike, filePath: string | null | undefined): Promise<AnswersLike> {
  const groups = await answerGroupsFor(filePath);
  return groups.length ? regroupAnswers(key, answers, groups) : answers;
}
