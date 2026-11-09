// Linkify — renders URLs in message text as tappable links, stripping
// trailing punctuation from the href (same behavior as v1).
import { Fragment } from "react";

export const URL_RE = /(https?:\/\/[^\s]+)/;

export default function Linkify({ children, className = "" }) {
  const text = children || "";
  if (typeof text !== "string" || !URL_RE.test(text)) return text;
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
    const trail = (part.match(/[.,;:!?)\]}'"]+$/) || [""])[0];
    const href = trail ? part.slice(0, -trail.length) : part;
    return (
      <span key={i}>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`underline underline-offset-2 break-all ${className}`}
        >
          {href}
        </a>
        {trail}
      </span>
    );
  });
}
