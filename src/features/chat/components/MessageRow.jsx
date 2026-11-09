// MessageRow — one message bubble: avatar, sender line, reply context,
// text / image / file attachment or PollCard, hover actions (reply, copy,
// pin, delete), timestamp + read receipt, and reactions (one at a time, tap
// to toggle). Reactions render as Lucide icons; the stored values
// ("like"|"dislike"|"heart") are unchanged from v1.
import {
  Check,
  Copy,
  FileText,
  Heart,
  Image as ImageIcon,
  Pin,
  Reply,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Video,
} from "lucide-react";
import { formatTime } from "../../../lib/dates";
import Linkify from "./Linkify";
import PollCard from "./PollCard";

// Reaction key → Lucide icon. Stored value stays the v1 string.
export const REACTIONS = [
  ["like", ThumbsUp],
  ["dislike", ThumbsDown],
  ["heart", Heart],
];

export const AttIcon = ({ type }) =>
  type === "image" ? (
    <ImageIcon className="w-4 h-4" />
  ) : type === "video" ? (
    <Video className="w-4 h-4" />
  ) : (
    <FileText className="w-4 h-4" />
  );

export default function MessageRow({
  message: m,
  own,
  user,
  isAdmin,
  seenCount,
  onOpenSeen,
  onReply,
  onCopy,
  copied,
  onTogglePin,
  onDelete,
  onVote,
  onReact,
  onSeeVoters,
}) {
  return (
    <div className={`flex gap-2 group ${own ? "flex-row-reverse" : "flex-row"}`}>
      {!own && (
        <div
          className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0 ${
            m.isCoach ? "bg-brand-primary" : "bg-ink-faint"
          }`}
        >
          {m.initials}
        </div>
      )}
      <div className={`max-w-[80%] flex flex-col ${own ? "items-end" : "items-start"}`}>
        {!own && (
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-[11px] font-bold text-ink-soft">{m.sender}</span>
            {m.isCoach && (
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-accent">
                Coach
              </span>
            )}
          </div>
        )}

        {m.replyToId && m.replyToSender && (
          <div
            className={`text-[11px] mb-1 px-2 py-1 rounded-lg border-l-2 max-w-full bg-brand-accent-soft ${
              own ? "self-end" : "self-start"
            } border-brand-accent`}
          >
            <div className="font-bold text-ink">{m.replyToSender}</div>
            <div className="text-ink-soft truncate">{m.replyToText}</div>
          </div>
        )}

        <div className="flex items-center gap-1.5">
          {own && isAdmin && (
            <button
              onClick={() => onTogglePin(m)}
              aria-label={m.pinned ? "Unpin message" : "Pin message"}
              title={m.pinned ? "Unpin" : "Pin"}
              className={`${m.pinned ? "text-brand-accent" : "text-ink-faint"} hover:text-brand-accent`}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          )}

          {m.kind === "poll" ? (
            <PollCard
              message={m}
              own={own}
              myUid={user.uid}
              onVote={(idx) => onVote(m.id, idx)}
              isAdmin={isAdmin}
              onSeeVoters={() => onSeeVoters(m)}
            />
          ) : (
            <div
              className={`rounded-xl shadow-card overflow-hidden ${
                own ? "bg-brand-primary text-white" : "bg-white text-ink"
              }`}
            >
              {m.attachment?.type === "image" && m.attachment.url && (
                <a href={m.attachment.url} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={m.attachment.url}
                    alt=""
                    className="w-full max-h-80 object-cover"
                    loading="lazy"
                  />
                </a>
              )}
              {m.text && (
                <p className="text-sm leading-snug break-words px-3 py-2 select-text">
                  <Linkify>{m.text}</Linkify>
                </p>
              )}
              {m.attachment && m.attachment.type !== "image" && (
                <div
                  className={`mx-3 mb-2 rounded-xl p-2 flex items-center gap-2 ${
                    own ? "bg-white/15" : "bg-[var(--th-surface-2)]"
                  }`}
                >
                  <AttIcon type={m.attachment.type} />
                  <span className="text-[11px] font-semibold truncate">{m.attachment.name}</span>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => onReply(m)}
            aria-label="Reply"
            title="Reply"
            className="text-ink-faint hover:text-ink-soft opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Reply className="w-3.5 h-3.5" />
          </button>
          {(m.text || m.kind === "poll") && (
            <button
              onClick={() => onCopy(m)}
              aria-label="Copy message"
              title="Copy"
              className="text-ink-faint hover:text-ink-soft opacity-0 group-hover:opacity-100 transition-opacity"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-brand-success" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
          {!own && isAdmin && (
            <button
              onClick={() => onTogglePin(m)}
              aria-label={m.pinned ? "Unpin message" : "Pin message"}
              className={`${m.pinned ? "text-brand-accent" : "text-ink-faint"} hover:text-brand-accent opacity-0 group-hover:opacity-100 transition-opacity`}
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          )}
          {isAdmin && (
            <button
              onClick={() => onDelete(m.id)}
              aria-label="Delete message"
              className="text-ink-faint hover:text-[var(--th-danger)] opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1 px-1">
          <span className="text-[11px] text-ink-faint">{formatTime(m.createdAt)}</span>
          {own &&
            (isAdmin ? (
              <button
                onClick={() => onOpenSeen(m)}
                className="text-[11px] font-semibold text-ink-soft hover:text-ink underline-offset-2 hover:underline"
              >
                · Seen by {seenCount}
              </button>
            ) : (
              seenCount > 0 && (
                <span className="text-[11px] font-semibold text-ink-soft">· Seen by {seenCount}</span>
              )
            ))}
        </div>

        <div className={`flex items-center gap-1 mt-1 ${own ? "flex-row-reverse" : ""}`}>
          {REACTIONS.map(([key, Icon]) => {
            const reax = m.reactions || {};
            const count = Object.values(reax).filter((v) => v === key).length;
            const mine = reax[user.uid] === key;
            return (
              <button
                key={key}
                onClick={() => onReact(m.id, mine ? null : key)}
                aria-label={key}
                className={`leading-none px-1.5 py-1 rounded-full border transition-colors flex items-center gap-0.5 ${
                  mine
                    ? "border-transparent bg-brand-accent-soft"
                    : "border-[var(--th-surface-2)] bg-white hover:bg-[var(--th-surface-2)]"
                } ${count ? "" : "opacity-60"}`}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${mine ? "text-brand-accent" : "text-ink-soft"}`}
                  fill={mine ? "currentColor" : "none"}
                />
                {count > 0 && (
                  <span className="ml-0.5 text-[11px] font-semibold text-ink-soft">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
