// Words this site does not use in reader-facing text. Each entry is a pattern to find and how to fix it. After the
// writing step produces a title, summary and reason, each pattern is checked; on a match the model fixes only those
// words, once (mendWording in packages/backend/src/editorial/analyze.ts). List only what is obvious at a glance:
// anything doubtful would rewrite normal words. Empty means no check.

export const READER_WORDING: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:game[- ]?chang(?:er|ing)|groundbreaking|revolutionary|mind-blowing|jaw-dropping)\b/i, "No hype words: say plainly what happened"],
  [/\b(?:unleash(?:es|ed)?|supercharg(?:e|es|ed)|turbocharg(?:e|es|ed))\b/i, "No marketing verbs: use a plain verb such as adds, speeds up or releases"],
];
