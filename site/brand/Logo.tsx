// The site's wordmark and ring mark: pages draw the name with Wordmark (size is its height in pixels); RingMark is
// the small mark, and spinning it is the loader. The wordmark is the AI Pulse pulse mark followed by the site name.
import { SITE } from "../site.ts";

export function Wordmark({ size = 24, className = "", title = SITE.name }: { size?: number; className?: string; title?: string }) {
  return (
    <span className={`inline-flex items-center font-black leading-none tracking-[-0.03em] ${className}`} style={{ fontSize: Math.round(size * 0.92) }} aria-label={title} role="img">
      <svg aria-hidden="true" viewBox="0 0 512 512" className="mr-[0.3em] inline-block size-[0.9em] shrink-0">
        <rect width="512" height="512" rx="116" fill="#13191c" />
        <path d="M76 276H170L214 160L284 360L330 236L356 276H436" fill="none" stroke="#2ce2e8" strokeWidth="44" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span aria-hidden="true">{SITE.name}</span>
    </span>
  );
}

/** A ring with a dot; spinning, it is the loader. */
export function RingMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g style={spinning ? { transformOrigin: "12px 12px", animation: "spin-slow 1.1s linear infinite" } : undefined}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="42 15" />
      </g>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}
