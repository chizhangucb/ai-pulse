// Words the site keeps out of what readers read (industry/wording.ts): each use in a written title, summary or
// reason, named with what to write instead, for the one call that mends them (analyze.ts, mendWording).
import { READER_WORDING } from "@aihot/industry/wording";
import { ITEM_COPY } from "@aihot/site";

export interface ReaderCopy {
  titleZh: string;
  summaryZh: string;
  reasonZh: string | null;
}

const FIELDS: Array<[keyof ReaderCopy, string]> = [["titleZh", "Title"], ["summaryZh", "Summary"], ["reasonZh", ITEM_COPY.reasonLabel]];

/**
 * Every use of a word of the list in a copy, each as a line the model can act on: where, the words around it,
 * and the fix. Each use is its own line, so a copy that mends one of two has fewer.
 */
export function wordingProblems(copy: ReaderCopy): string[] {
  const problems: string[] = [];
  for (const [field, name] of FIELDS) {
    const text = copy[field];
    if (!text) continue;
    for (const [pattern, fix] of READER_WORDING) {
      for (const hit of text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace("g", "")}g`))) {
        problems.push(`${name} uses "${hit[0]}" ("${text.slice(Math.max(0, hit.index - 20), hit.index + hit[0].length + 20)}"): ${fix}`);
      }
    }
  }
  return problems;
}
