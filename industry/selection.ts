// The selection thresholds. The scoring standard itself is in prompts/selection-score.md; this file only decides how
// many points make a pick. A scoring model scores each item twice, independently (0 to 100); an item whose two scores
// add up to at least 2 × the threshold becomes a pick candidate. After its news identity and added value are checked,
// publication rules decide what shows (docs/selection.md); cards show the average of the two scores.
// Thresholds differ by source tier: official first-party sources need less, media and individuals more. After changing
// a threshold or the score prompt, rerun scripts/eval-selection.ts on your own labeled sample before going live.

export const SELECTION = {
  /**
   * Source tier → pick threshold (average score). Tiers are set per source in the admin:
   *   T1 official first-party (sites, official blogs, institutions) · T1_5 official accounts and near-official
   *   creators · T2 media and individuals.
   * EXCLUDE_MP and tiers not listed here are not scored for picks (they only appear in "All news").
   */
  thresholds: { T1: 60, T1_5: 65, T2: 76 } as Record<string, number>,
  /**
   * Items that were not picked but average above this are still written like picks (title, summary and reason);
   * the rest get the cheaper title-and-summary step.
   */
  understandFloor: 50,
} as const;
