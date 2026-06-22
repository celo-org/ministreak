import Link from "next/link";

/**
 * Inline legal/support links. Rendered directly inside the page content
 * (no global divider, no fixed positioning) to keep the page airy.
 *
 * Support routes to a Google Form support intake (web support portal),
 * satisfying the MiniPay in-app support requirement (§6).
 */
const SUPPORT_HREF =
  "https://docs.google.com/forms/d/e/1FAIpQLSc0Npx2Fn3CWBWbaXgHk8SGoxkCKUuzryizSbMPpu9FU5lJWQ/viewform";

export default function LegalLinks() {
  return (
    <div className="flex items-center justify-center gap-5 text-sm text-ink-mute">
      <Link href="/terms" className="hover:text-forest transition-colors underline-offset-4 hover:underline">
        Terms
      </Link>
      <span className="text-ink-faint">·</span>
      <Link href="/privacy" className="hover:text-forest transition-colors underline-offset-4 hover:underline">
        Privacy
      </Link>
      <span className="text-ink-faint">·</span>
      <a
        href={SUPPORT_HREF}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-forest transition-colors underline-offset-4 hover:underline"
      >
        Support
      </a>
    </div>
  );
}
