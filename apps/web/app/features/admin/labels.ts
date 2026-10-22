// Shared admin vocabulary.
export const KIND_LABEL: Record<string, string> = { rss: "RSS", web_list: "Web list", json_list: "JSON", x_search: "X", mp_account: "WeChat", external: "Pushed" };
export const MODE_LABEL: Record<string, string> = { editorial: "Editorial", hot_signal: "Heat only", isolated: "Isolated" };
export const HEALTH_LABEL: Record<string, string> = { ok: "OK", degraded: "Unstable", failing: "Failing", paused: "Paused", unknown: "Not checked" };
export const VISIBILITY_LABEL: Record<string, string> = { public: "Public", "summary-only": "Summary only", withdrawn: "Withdrawn" };
export const FEEDBACK_STATUS: Record<string, string> = { new: "New", triaged: "In progress", replied: "Replied", resolved: "Resolved", spam: "Spam" };
export const TIER_LABEL: Record<string, string> = { T1: "T1", T1_5: "T1.5", T2: "T2", EXCLUDE_MP: "Excluded (WeChat)" };
