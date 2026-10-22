import { monthDay } from "@aihot/contracts/time";
import { weekdayShort } from "../../lib/format";

/** Release notes carry a little Markdown: **bold** runs. */
export function Inline({ text }: { text: string }) {
  return <>{text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <b key={i} className="font-semibold text-ink-2">{part}</b> : part))}</>;
}

export function dateHeading(date: string): { label: string; weekday: string } {
  return { label: monthDay(date, "0000"), weekday: weekdayShort(date) };
}
