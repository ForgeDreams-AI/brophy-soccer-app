// Split out of TeamHubRoles.jsx (F81). Area: chat.
// Every top-level declaration here is exported for the other app modules.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, BarChart3, Bell, BellOff, Camera, Check, ChevronDown, ChevronLeft, ChevronUp, Clock, Copy, Eye, FileText, Folder, Hash, Image as ImageIcon, Layers, Link as LinkIcon, Maximize2, Paperclip, Pin, Play, Plus, Repeat, Reply, Trash2, Video, X } from "lucide-react";
import { collection, deleteField, doc, getDocs, updateDoc } from "firebase/firestore";
import { db, storage } from "../firebase";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { isLoading, useDoc } from "../hooks/useCollection";
import { clearChatNotifications, isChatMuted, mutedLabel } from "../lib/notifications";
import { toast } from "../lib/toast";
import { getTeam } from "../data/teams";
import { LoadingNote } from "./home";
import { AutoGrowTextarea, Avatar, COLORS, audienceKeysFor, formatDateHeader, formatDayKey, formatTime, isStaffRole, reportError } from "./shared";


/* ─── CHAT (pin + shared media/links + threads + polls + read receipts + photos) ─── */
export const URL_RE = /(https?:\/\/[^\s]+)/;
// Render chat text with clickable links. Trailing punctuation is kept out of
// the href so "see https://x.com." doesn't carry the period into the link.
export const Linkify = ({ children, className = "" }) => {
  const text = children || "";
  if (typeof text !== "string" || !URL_RE.test(text)) return text;
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) => {
    if (i % 2 === 0) return part;
    const trail = (part.match(/[.,;:!?)\]}'"]+$/) || [""])[0];
    const href = trail ? part.slice(0, -trail.length) : part;
    return (
      <span key={i}>
        <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className={`underline underline-offset-2 break-all ${className}`}>{href}</a>{trail}
      </span>
    );
  });
};
// Reactions a member can leave on a message — one at a time, tap to toggle.
export const REACTIONS = [["like", "👍"], ["dislike", "👎"], ["heart", "❤️"]];

/* ─── iMessage-style chat pieces ─────────────────────────────────────────── */
export const IOS_GRAY = "#E9E9EB";
export const GROUP_GAP_MS = 5 * 60 * 1000; // messages within 5 min from one sender group together
export const tsMs = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : Date.now());

// Bubble corners like iMessage: fully round, with the corner nearest the
// next/previous bubble from the same sender tightened.
export const bubbleRadius = (own, first, last) => {
  const big = "18px", small = "6px";
  return own
    ? `${big} ${first ? big : small} ${last ? big : small} ${big}`
    : `${first ? big : small} ${big} ${big} ${last ? big : small}`;
};

// Long-press (touch), right-click (mouse) or double-click opens the message
// menu. Moving the finger (scrolling) cancels the press.
export const LongPress = ({ onLong, children, className = "", style }) => {
  const timer = useRef(null);
  const origin = useRef(null);
  const clear = () => { clearTimeout(timer.current); timer.current = null; };
  return (
    <div
      className={className}
      style={{ WebkitTouchCallout: "none", ...style }}
      onPointerDown={(e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        origin.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = setTimeout(() => { timer.current = null; onLong(); if (navigator.vibrate) navigator.vibrate(10); }, 420);
      }}
      onPointerMove={(e) => {
        if (!timer.current || !origin.current) return;
        if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 8) clear();
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onPointerLeave={clear}
      onContextMenu={(e) => { e.preventDefault(); clear(); onLong(); }}
      onDoubleClick={(e) => { e.preventDefault(); onLong(); }}
    >
      {children}
    </div>
  );
};

// Tapback badge on the bubble's corner — only when someone has reacted.
export const ReactionBadge = ({ reactions = {}, myUid, own, onClick }) => {
  const counts = REACTIONS.map(([key, emoji]) => [key, emoji, Object.values(reactions).filter((v) => v === key).length]).filter(([, , n]) => n > 0);
  if (!counts.length) return null;
  const total = counts.reduce((s, [, , n]) => s + n, 0);
  const mine = Boolean(reactions[myUid]);
  return (
    <button onClick={onClick} aria-label={`${total} reaction${total === 1 ? "" : "s"}`}
      className={`absolute -top-3 ${own ? "-left-2" : "-right-2"} z-10 flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[12px] leading-none shadow-sm border`}
      style={{ backgroundColor: mine ? COLORS.accentSoft : "#fff", borderColor: mine ? COLORS.accent : "#E2E8F0" }}>
      {counts.map(([key, emoji]) => <span key={key}>{emoji}</span>)}
      {total > 1 && <span className="text-[10px] font-bold text-slate-500 ml-0.5">{total}</span>}
    </button>
  );
};

// Context menu for a message (iOS style): tapback row + actions.
export const MessageActionSheet = ({ preview, own, myReaction, onReact, actions = [], onClose }) => (
  <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center p-6 bg-black/35 backdrop-blur-sm" onClick={onClose}>
    <div className="w-full max-w-xs space-y-2" onClick={(e) => e.stopPropagation()}>
      {onReact && (
        <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
          <div className="flex items-center gap-1 bg-white rounded-full shadow-xl px-2 py-1.5">
            {REACTIONS.map(([key, emoji]) => (
              <button key={key} onClick={() => { onReact(myReaction === key ? null : key); onClose(); }} aria-label={key}
                className="w-10 h-10 rounded-full flex items-center justify-center text-xl transition-transform active:scale-90"
                style={myReaction === key ? { backgroundColor: COLORS.accentSoft } : {}}>{emoji}</button>
            ))}
          </div>
        </div>
      )}
      <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
        <div className="max-w-full rounded-[18px] px-3.5 py-2 text-[15px] leading-snug shadow-xl line-clamp-6 break-words"
          style={own ? { backgroundColor: COLORS.primary, color: "#fff" } : { backgroundColor: "#fff", color: "#0F172A" }}>{preview}</div>
      </div>
      <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
        <div className="w-56 bg-white/95 rounded-2xl shadow-xl overflow-hidden divide-y divide-slate-100">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.label} onClick={() => { a.onClick(); onClose(); }}
                className={`w-full flex items-center justify-between px-4 py-3 text-[15px] ${a.danger ? "text-red-600" : "text-slate-900"} active:bg-slate-100`}>
                {a.label}<Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);

// Message box: one ＋ button (opens a tray of attachments/tools), a
// full-width text field that grows to 5 lines, and the send arrow inside it.
export const ChatComposer = ({ value, onChange, onSend, placeholder, uploading = false, actions = [], banner = null }) => {
  const [trayOpen, setTrayOpen] = useState(false);
  const canSend = value.trim().length > 0;
  return (
    <div className="bg-white/95 backdrop-blur border-t border-slate-200 shrink-0">
      {banner}
      {trayOpen && actions.length > 0 && (
        <div className="px-3 pt-3 pb-1 grid grid-cols-4 gap-1">
          {actions.map((a) => {
            const Icon = a.icon;
            return (
              <button key={a.key} disabled={a.disabled} onClick={() => { a.onClick(); if (!a.keepOpen) setTrayOpen(false); }}
                className="flex flex-col items-center gap-1 py-1.5 rounded-2xl disabled:opacity-40 active:bg-slate-100">
                <span className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
                  style={a.active ? { backgroundColor: COLORS.primary, color: "#fff" } : { backgroundColor: "#F1F5F9", color: COLORS.primary }}>
                  <Icon className="w-5 h-5" />
                </span>
                <span className="text-[11px] font-semibold text-slate-600 leading-tight text-center">{a.label}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="px-3 py-2 flex items-end gap-2" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
        {actions.length > 0 && (
          <button onClick={() => setTrayOpen((o) => !o)} aria-label={trayOpen ? "Close attachments" : "Add a photo, video, file or poll"} aria-expanded={trayOpen}
            className="w-9 h-9 mb-[2px] rounded-full flex items-center justify-center shrink-0 transition-transform"
            style={{ backgroundColor: "#F1F5F9", color: COLORS.textSecondary, transform: trayOpen ? "rotate(45deg)" : "none" }}>
            {uploading ? <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Plus className="w-5 h-5" />}
          </button>
        )}
        <div className="flex-1 min-w-0 flex items-end rounded-[20px] border border-slate-300 bg-white pl-3.5 pr-1 py-1 focus-within:border-slate-400">
          <AutoGrowTextarea value={value} onChange={onChange} onSubmit={onSend} placeholder={placeholder} aria-label="Message"
            className="flex-1 min-w-0 bg-transparent text-[15px] py-1 focus:outline-none" />
          <button onClick={onSend} disabled={!canSend} aria-label="Send"
            className="w-8 h-8 rounded-full flex items-center justify-center text-white shrink-0 transition-opacity"
            style={{ backgroundColor: COLORS.primary, opacity: canSend ? 1 : 0.25 }}>
            <ArrowUp className="w-[18px] h-[18px]" strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
};

export const PollCard = ({ message, own, myUid, onVote, isAdmin = false, onSeeVoters }) => {
  // My own vote doc (private); tallies come from `voteCounts` on the poll
  // (server-maintained). Legacy polls fall back to the old votes map.
  const myVoteDoc = useDoc(message?.id && myUid ? `messages/${message.id}/votes/${myUid}` : null);
  const legacy = message.votes || {};
  const myVote = myVoteDoc ? myVoteDoc.option : legacy[myUid];
  const opts = message.options || [];
  const totals = Array.isArray(message.voteCounts)
    ? opts.map((_, i) => Number(message.voteCounts[i]) || 0)
    : opts.map((_, i) => Object.values(legacy).filter((v) => v === i).length);
  const totalVotes = totals.reduce((a, b) => a + b, 0);
  const handle = (i) => { if (myVote !== i) onVote(i).catch((e) => toast("Couldn't vote — " + (e.message || ""))); };
  return (
    <div className={`rounded-2xl px-3 py-2.5 shadow-sm w-64 ${own ? "text-white" : "bg-white text-slate-900"}`} style={own ? { backgroundColor: COLORS.primary } : {}}>
      <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 flex items-center gap-1 ${own ? "text-white/70" : "text-slate-500"}`}>
        <BarChart3 className="w-3 h-3" /> Poll
      </div>
      <p className="text-sm font-semibold leading-snug break-words mb-2">{message.question}</p>
      <ul className="space-y-1.5">
        {opts.map((opt, i) => {
          const count = totals[i] || 0;
          const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0;
          const isMine = myVote === i;
          return (
            <li key={i}>
              <button onClick={() => handle(i)} className="w-full text-left relative rounded-lg overflow-hidden border" style={{ borderColor: isMine ? COLORS.accent : (own ? "rgba(255,255,255,0.2)" : COLORS.border) }}>
                <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${pct}%`, backgroundColor: isMine ? (own ? "rgba(166,25,46,0.45)" : COLORS.accentSoft) : (own ? "rgba(255,255,255,0.12)" : "rgba(152,0,0,0.06)") }} />
                <div className="relative px-2.5 py-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold truncate flex items-center gap-1">
                    {isMine && <Check className="w-3 h-3 flex-shrink-0" style={{ color: COLORS.accent }} />}
                    {opt}
                  </span>
                  <span className="text-[10px] font-semibold opacity-80">{count} · {pct}%</span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={`text-[10px] mt-2 ${own ? "text-white/60" : "text-slate-400"}`}>
        {totalVotes} vote{totalVotes === 1 ? "" : "s"}{myVote != null ? " · You voted" : ""}
      </div>
      {isAdmin && onSeeVoters && (
        <button onClick={onSeeVoters} className={`mt-1.5 text-[10px] font-bold uppercase tracking-wider ${own ? "text-white/80 hover:text-white" : "text-slate-500 hover:text-slate-700"}`}>
          See who voted →
        </button>
      )}
    </div>
  );
};

// Pick who an item is for: Everyone, or a mix of existing groups + individual
// players. Players show the display name from their own profile, with their
// email underneath as the disambiguator. Shared by the create form and the
// after-the-fact membership editor below so the two can't drift apart.
export const AudiencePicker = ({ groups = [], players = [], nameOf, mode, setMode, groupIds, setGroupIds, emails, setEmails }) => {
  const toggle = (arr, setArr, val) => setArr(arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val]);
  return (
    <>
      <div className="flex gap-2">
        <button onClick={() => setMode("everyone")} className={`flex-1 py-2 rounded-full text-xs font-bold ${mode === "everyone" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={mode === "everyone" ? { backgroundColor: COLORS.primary } : {}}>Everyone</button>
        <button onClick={() => setMode("custom")} className={`flex-1 py-2 rounded-full text-xs font-bold ${mode === "custom" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={mode === "custom" ? { backgroundColor: COLORS.primary } : {}}>Specific people</button>
      </div>
      {mode === "custom" && (
        <div className="space-y-2">
          {groups.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Groups</p>
              <div className="flex flex-wrap gap-1.5">
                {groups.map((g) => {
                  const on = groupIds.includes(g.id);
                  return <button key={g.id} onClick={() => toggle(groupIds, setGroupIds, g.id)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${on ? "text-white" : "bg-white text-slate-600 border-slate-200"}`} style={on ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary } : {}}>{g.name}</button>;
                })}
              </div>
            </div>
          )}
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Players</p>
            {players.length === 0 ? <p className="text-[11px] text-slate-400 italic">No players on the roster yet.</p> : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {players.map((p) => {
                  const on = emails.includes(p.email);
                  const nm = nameOf(p.email);
                  return (
                    <button key={p.email} onClick={() => toggle(emails, setEmails, p.email)} className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                      <span className="min-w-0 flex-1">
                        {nm
                          ? <><span className="text-xs font-semibold text-slate-800 truncate block leading-tight">{nm}</span><span className="text-[10px] font-mono text-slate-400 truncate block leading-tight">{p.email}</span></>
                          : <span className="text-xs font-mono text-slate-700 truncate block">{p.email}</span>}
                      </span>
                      {on ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.success }} /> : <span className="w-4 h-4 rounded border border-slate-300 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

// One row in "Your group chats" — names who can see it and, when expanded,
// lets the coach add or remove people and whole groups after creation.
export const ChannelRow = ({ channel, groups, players, nameOf, onUpdate, onDelete }) => {
  const v = channel.visibleTo || {};
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("everyone");
  const [groupIds, setGroupIds] = useState([]);
  const [emails, setEmails] = useState([]);

  // Re-seed from the live doc each time the editor opens, so a membership
  // change made elsewhere isn't clobbered by stale state from a previous open.
  const startEdit = () => {
    const vv = channel.visibleTo || {};
    setMode((vv.emails || []).length || (vv.groupIds || []).length ? "custom" : "everyone");
    setGroupIds(vv.groupIds || []);
    setEmails(vv.emails || []);
    setEditing(true);
  };

  const save = async () => {
    setBusy(true);
    const visibleTo = mode === "custom" ? { groupIds, emails } : { groupIds: [], emails: [] };
    try { await onUpdate(channel.id, visibleTo); setEditing(false); toast("Members updated"); }
    catch (e) { toast("Couldn't update — " + (e.message || "")); }
    finally { setBusy(false); }
  };

  const audience = [
    ...(v.groupIds || []).map((gid) => groups.find((g) => g.id === gid)?.name).filter(Boolean),
    ...(v.emails || []).map((em) => nameOf(em) || em),
  ];

  return (
    <li className="bg-slate-50 rounded-lg px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-800 truncate">#{channel.name}</div>
          <div className="text-[10px] text-slate-400 truncate">{audience.length ? audience.join(", ") : "Everyone"}</div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button onClick={() => (editing ? setEditing(false) : startEdit())} className="text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full text-white" style={{ backgroundColor: COLORS.primary }}>{editing ? "Cancel" : "Members"}</button>
          <button onClick={async () => { if (confirm(`Delete "${channel.name}"?`)) { try { await onDelete(channel.id); } catch (e) { toast("Couldn't delete — " + (e.message || "")); } } }} className="text-slate-300 hover:text-red-500 p-1"><Trash2 className="w-4 h-4" /></button>
        </div>
      </div>
      {editing && (
        <div className="mt-2 pt-2 border-t border-slate-200 space-y-2">
          <AudiencePicker groups={groups} players={players} nameOf={nameOf} mode={mode} setMode={setMode} groupIds={groupIds} setGroupIds={setGroupIds} emails={emails} setEmails={setEmails} />
          <button onClick={save} disabled={busy} className="w-full py-2 rounded-full text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Saving…" : "Save members"}</button>
        </div>
      )}
    </li>
  );
};

// Coach-only: create a group chat and choose who can see it (everyone, or a mix
// of existing groups + individual players). Also lists channels, edits their
// membership after creation, and deletes them.
export const ChannelModal = ({ chatGroups, groups, roster, nameByEmail = {}, onCreate, onDelete, onUpdate, onClose }) => {
  const [name, setName] = useState("");
  const [mode, setMode] = useState("everyone"); // everyone | custom
  const [groupIds, setGroupIds] = useState([]);
  const [emails, setEmails] = useState([]);
  const [busy, setBusy] = useState(false);
  const nameOf = (email) => nameByEmail[(email || "").toLowerCase()] || "";
  const players = (roster || [])
    .filter((r) => !isStaffRole(r.role))
    // Show players with a known name first, then alphabetically by name/email.
    .sort((a, b) => (nameOf(a.email) || a.email || "").localeCompare(nameOf(b.email) || b.email || ""));

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const visibleTo = mode === "custom" ? { groupIds, emails } : { groupIds: [], emails: [] };
    try { await onCreate(name, visibleTo); setName(""); setMode("everyone"); setGroupIds([]); setEmails([]); }
    catch (e) { toast("Couldn't create — " + (e.message || "")); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[88vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900">Group chats</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="space-y-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Group chat name (e.g. Captains)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
            <AudiencePicker groups={groups} players={players} nameOf={nameOf} mode={mode} setMode={setMode} groupIds={groupIds} setGroupIds={setGroupIds} emails={emails} setEmails={setEmails} />
            <button onClick={create} disabled={busy || !name.trim()} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Creating…" : "Create group chat"}</button>
          </div>

          {chatGroups.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Your group chats</p>
              <ul className="space-y-1.5">
                {chatGroups.map((c) => (
                  <ChannelRow key={c.id} channel={c} groups={groups} players={players} nameOf={nameOf} onUpdate={onUpdate} onDelete={onDelete} />
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Coach-only: schedule a push reminder or a chat poll to fire at a future time.
// Docs land in the `scheduled` collection; a Cloud Function sweeps and sends
// them (see functions/index.js runScheduled).
export const tsMillis = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : (ts instanceof Date ? ts.getTime() : 0));
export const DOW_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
export const DOW_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Next local occurrence (Date) on one of `days` at h:m, strictly in the future.
export const nextLocalOccurrence = (days, h, m) => {
  const now = Date.now();
  for (let i = 0; i < 14; i++) {
    const c = new Date();
    c.setDate(c.getDate() + i);
    c.setHours(h, m, 0, 0);
    if (days.includes(c.getDay()) && c.getTime() > now) return c;
  }
  return null;
};
// Short human label for a scheduled item's recurrence.
export const repeatLabel = (s) => {
  if (!s.repeat || s.repeat === "none") return "";
  if (s.repeat === "daily") return "Daily";
  const days = s.repeatDays || [];
  if (s.repeat === "weekly") return `Weekly · ${DOW_ABBR[days[0]] || ""}`;
  return days.map((d) => DOW_ABBR[d]).join(" ");
};
export const ScheduledModal = ({ scheduled = [], onAdd, onDelete, chatGroups = [], groups = [], roster = [], nameByEmail = {}, onClose }) => {
  const [kind, setKind] = useState("reminder"); // reminder | poll
  const [busy, setBusy] = useState(false);
  const [when, setWhen] = useState("");
  const [repeat, setRepeat] = useState("none"); // none | daily | weekly | custom
  const [customDays, setCustomDays] = useState([]); // weekday numbers for custom
  // reminder
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audMode, setAudMode] = useState("everyone"); // everyone | custom
  const [groupIds, setGroupIds] = useState([]);
  const [emails, setEmails] = useState([]);
  // poll
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [channel, setChannel] = useState("team");

  const channels = [{ id: "team", name: "Team" }, ...chatGroups.map((c) => ({ id: c.id, name: c.name }))];
  const nameOf = (email) => nameByEmail[(email || "").toLowerCase()] || "";
  const players = (roster || []).filter((r) => !isStaffRole(r.role));
  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const setOpt = (i, v) => setOptions((o) => o.map((x, j) => (j === i ? v : x)));

  const reset = () => { setWhen(""); setRepeat("none"); setCustomDays([]); setTitle(""); setBody(""); setAudMode("everyone"); setGroupIds([]); setEmails([]); setQuestion(""); setOptions(["", ""]); setChannel("team"); };

  const submit = async () => {
    let at = when ? new Date(when) : null;
    if (!at || isNaN(at.getTime())) { toast("Pick a date & time."); return; }
    // Resolve recurrence into a weekday set + first send time.
    let repeatDays = [];
    if (repeat === "daily") repeatDays = [0, 1, 2, 3, 4, 5, 6];
    else if (repeat === "weekly") repeatDays = [at.getDay()];
    else if (repeat === "custom") {
      if (!customDays.length) { toast("Pick at least one day to repeat on."); return; }
      repeatDays = [...customDays].sort();
      // If the picked start isn't on a chosen day (or is past), snap to the next match.
      if (!repeatDays.includes(at.getDay()) || at.getTime() <= Date.now()) {
        const nxt = nextLocalOccurrence(repeatDays, at.getHours(), at.getMinutes());
        if (!nxt) { toast("Couldn't find a matching day."); return; }
        at = nxt;
      }
    }
    if (at.getTime() <= Date.now()) { toast("Pick a date & time in the future."); return; }
    if (kind === "reminder" && !title.trim() && !body.trim()) { toast("Add a title or message."); return; }
    if (kind === "poll") {
      const opts = options.map((o) => o.trim()).filter(Boolean);
      if (!question.trim() || opts.length < 2) { toast("A poll needs a question and at least 2 options."); return; }
    }
    const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
    const recur = { repeat, repeatDays, tz };
    setBusy(true);
    try {
      if (kind === "reminder") {
        const visibleTo = audMode === "custom" ? { groupIds, emails } : { groupIds: [], emails: [] };
        await onAdd({ type: "reminder", title: title.trim(), body: body.trim(), visibleTo, sendAt: at, ...recur });
      } else {
        const opts = options.map((o) => o.trim()).filter(Boolean);
        const ch = channels.find((c) => c.id === channel);
        await onAdd({ type: "poll", question: question.trim(), options: opts, channel, channelName: ch?.name || "Team", sendAt: at, ...recur });
      }
      reset();
      toast("Scheduled.");
    } catch (e) { toast("Couldn't schedule — " + (e.message || "check rules.")); }
    finally { setBusy(false); }
  };

  // Hide event-attached auto reminders here — those are managed on the event.
  const list = [...scheduled].filter((s) => !s.auto).sort((a, b) => tsMillis(a.sendAt) - tsMillis(b.sendAt));

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5"><Clock className="w-4 h-4" style={{ color: COLORS.primary }} /> Scheduled</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setKind("reminder")} className={`flex-1 py-2 rounded-full text-xs font-bold ${kind === "reminder" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={kind === "reminder" ? { backgroundColor: COLORS.primary } : {}}>🔔 Reminder</button>
            <button onClick={() => setKind("poll")} className={`flex-1 py-2 rounded-full text-xs font-bold ${kind === "poll" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={kind === "poll" ? { backgroundColor: COLORS.primary } : {}}>📊 Poll</button>
          </div>

          {kind === "reminder" ? (
            <div className="space-y-2">
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Reminder title (e.g. Bring both jerseys)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              <AutoGrowTextarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message (optional)" minRows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Send to</p>
                <div className="flex gap-2">
                  <button onClick={() => setAudMode("everyone")} className={`flex-1 py-1.5 rounded-full text-[11px] font-bold ${audMode === "everyone" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={audMode === "everyone" ? { backgroundColor: COLORS.primary } : {}}>Everyone</button>
                  <button onClick={() => setAudMode("custom")} className={`flex-1 py-1.5 rounded-full text-[11px] font-bold ${audMode === "custom" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={audMode === "custom" ? { backgroundColor: COLORS.primary } : {}}>Specific people</button>
                </div>
              </div>
              {audMode === "custom" && (
                <div className="space-y-2">
                  {groups.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {groups.map((g) => { const on = groupIds.includes(g.id); return <button key={g.id} onClick={() => toggle(groupIds, setGroupIds, g.id)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${on ? "text-white" : "bg-white text-slate-600 border-slate-200"}`} style={on ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary } : {}}>{g.name}</button>; })}
                    </div>
                  )}
                  {players.length > 0 && (
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                      {players.map((p) => { const on = emails.includes(p.email); const nm = nameOf(p.email); return (
                        <button key={p.email} onClick={() => toggle(emails, setEmails, p.email)} className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                          <span className="text-xs text-slate-700 truncate">{nm || p.email}</span>
                          {on ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.success }} /> : <span className="w-4 h-4 rounded border border-slate-300 flex-shrink-0" />}
                        </button>
                      ); })}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Poll question (e.g. Who's making the game?)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              {options.map((o, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input value={o} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Option ${i + 1}`} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
                  {options.length > 2 && <button onClick={() => setOptions((arr) => arr.filter((_, j) => j !== i))} className="text-slate-300 hover:text-red-500"><X className="w-4 h-4" /></button>}
                </div>
              ))}
              {options.length < 4 && <button onClick={() => setOptions((arr) => [...arr, ""])} className="text-[11px] font-bold" style={{ color: COLORS.primary }}>+ Add option</button>}
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Post to</p>
                <select value={channel} onChange={(e) => setChannel(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                  {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          )}

          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{repeat === "none" ? "When" : "Starts"}</p>
            <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Repeat</p>
            <div className="grid grid-cols-4 gap-1.5">
              {[["none", "Once"], ["daily", "Daily"], ["weekly", "Weekly"], ["custom", "Custom"]].map(([val, lbl]) => (
                <button key={val} onClick={() => setRepeat(val)} className={`py-1.5 rounded-full text-[11px] font-bold ${repeat === val ? "text-white" : "bg-slate-100 text-slate-600"}`} style={repeat === val ? { backgroundColor: COLORS.primary } : {}}>{lbl}</button>
              ))}
            </div>
            {repeat === "custom" && (
              <div className="flex justify-between gap-1 mt-2">
                {DOW_LETTERS.map((ltr, d) => { const on = customDays.includes(d); return (
                  <button key={d} onClick={() => setCustomDays((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d])} className={`flex-1 h-8 rounded-lg text-[11px] font-bold ${on ? "text-white" : "bg-slate-100 text-slate-500"}`} style={on ? { backgroundColor: COLORS.primary } : {}} aria-label={DOW_ABBR[d]}>{ltr}</button>
                ); })}
              </div>
            )}
            {repeat === "weekly" && when && <p className="text-[10px] text-slate-400 mt-1">Repeats every {DOW_ABBR[new Date(when).getDay()]}.</p>}
          </div>
          <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Scheduling…" : "Schedule it"}</button>

          {list.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Queued</p>
              <ul className="space-y-1.5">
                {list.map((s) => {
                  const label = s.type === "poll" ? `📊 ${s.question || "Poll"} → ${s.channelName || "Team"}` : `🔔 ${s.title || s.body || "Reminder"}`;
                  const rep = repeatLabel(s);
                  const recurring = !!rep;
                  return (
                    <li key={s.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">{label}</div>
                        <div className="text-[10px] text-slate-500">{recurring ? "Next: " : ""}{new Date(tsMillis(s.sendAt)).toLocaleString([], { weekday: recurring ? "short" : undefined, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}{s.sent && !recurring ? " · Sent" : ""}</div>
                      </div>
                      {recurring
                        ? <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex-shrink-0 flex items-center gap-0.5" style={{ backgroundColor: COLORS.primary, color: "white" }}><Repeat className="w-2.5 h-2.5" />{rep}</span>
                        : s.sent ? <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: COLORS.success }} /> : <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.primary }}>Scheduled</span>}
                      <button onClick={() => { if (confirm("Cancel this scheduled item?")) Promise.resolve(onDelete(s.id)).catch(reportError("Couldn't cancel it")); }} aria-label="Cancel" className="text-slate-300 hover:text-red-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Custom push notifications — the coach composes a title + message, picks an
// audience (whole team, groups, or specific players — same picker pattern as
// the scheduled reminders), then either Sends now or Schedules it. Both paths
// store a doc in `pushNotifications` for the `runScheduled` runner: Send now
// writes sendAt as now, so the sweep picks it up within a few minutes, and
// Schedule writes a future sendAt, with an optional daily / weekly / custom
// repeat. Recurrence is stored as
// {type: "none"|"daily"|"weekly", time: "HH:MM", days: [weekday numbers]}.
// A "Custom" day pick is stored as type "weekly" with its days, since the
// runner only needs the weekday set + time.
export const PushNotificationModal = ({ pushNotifications = [], onAdd, onDelete, onSendNow, groups = [], roster = [], nameByEmail = {}, onClose }) => {
  const [busy, setBusy] = useState(false);
  const [sendMode, setSendMode] = useState("now"); // now | schedule
  const [when, setWhen] = useState("");
  const [repeat, setRepeat] = useState("none"); // none | daily | weekly | custom
  const [customDays, setCustomDays] = useState([]); // weekday numbers for custom
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audMode, setAudMode] = useState("everyone"); // everyone | custom
  const [groupIds, setGroupIds] = useState([]);
  const [emails, setEmails] = useState([]);

  const nameOf = (email) => nameByEmail[(email || "").toLowerCase()] || "";
  const players = (roster || []).filter((r) => !isStaffRole(r.role));
  const toggle = (arr, setArr, v) => setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const reset = () => { setSendMode("now"); setWhen(""); setRepeat("none"); setCustomDays([]); setTitle(""); setBody(""); setAudMode("everyone"); setGroupIds([]); setEmails([]); };

  const submit = async () => {
    if (!title.trim() && !body.trim()) { toast("Add a title or message."); return; }
    const visibleTo = audMode === "custom" ? { groupIds, emails } : { groupIds: [], emails: [] };
    const audienceKeys = audienceKeysFor(visibleTo, groups);
    setBusy(true);
    try {
      if (sendMode === "now") {
        await onSendNow({ title: title.trim(), body: body.trim(), audienceKeys, visibleTo });
        reset();
        toast("Queued. It goes out within a few minutes.");
      } else {
        let at = when ? new Date(when) : null;
        if (!at || isNaN(at.getTime())) { toast("Pick a date & time."); return; }
        // Resolve recurrence into a weekday set + first send time.
        let repeatDays = [];
        if (repeat === "daily") repeatDays = [0, 1, 2, 3, 4, 5, 6];
        else if (repeat === "weekly") repeatDays = [at.getDay()];
        else if (repeat === "custom") {
          if (!customDays.length) { toast("Pick at least one day to repeat on."); return; }
          repeatDays = [...customDays].sort();
          // If the picked start isn't on a chosen day (or is past), snap to the next match.
          if (!repeatDays.includes(at.getDay()) || at.getTime() <= Date.now()) {
            const nxt = nextLocalOccurrence(repeatDays, at.getHours(), at.getMinutes());
            if (!nxt) { toast("Couldn't find a matching day."); return; }
            at = nxt;
          }
        }
        if (at.getTime() <= Date.now()) { toast("Pick a date & time in the future."); return; }
        const tz = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch { return ""; } })();
        const recurrence = repeat === "none"
          ? { type: "none", time: "", days: [] }
          : { type: repeat === "custom" ? "weekly" : repeat, time: `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`, days: repeatDays };
        await onAdd({ title: title.trim(), body: body.trim(), audienceKeys, visibleTo, sendAt: at, recurrence, tz });
        reset();
        toast("Scheduled.");
      }
    } catch (e) { toast("Couldn't send — " + (e.message || "check rules.")); }
    finally { setBusy(false); }
  };

  // Queued (scheduled) first, then sent — newest first within each group.
  const list = [...pushNotifications].sort((a, b) => {
    const sa = a.status === "sent" ? 1 : 0, sb = b.status === "sent" ? 1 : 0;
    return (sa - sb) || (tsMillis(b.sendAt || b.createdAt) - tsMillis(a.sendAt || a.createdAt));
  });
  const recurrenceLabel = (n) => {
    const r = n.recurrence || {};
    if (!r.type || r.type === "none") return "";
    if (r.type === "daily") return "Daily";
    const days = (r.days || []).map((d) => DOW_ABBR[d]).join(" ");
    return r.days && r.days.length > 1 ? days : `Weekly · ${DOW_ABBR[(r.days || [])[0]] || ""}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-1.5"><Bell className="w-4 h-4" style={{ color: COLORS.primary }} /> Send notification</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setSendMode("now")} className={`flex-1 py-2 rounded-full text-xs font-bold ${sendMode === "now" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={sendMode === "now" ? { backgroundColor: COLORS.primary } : {}}>Send now</button>
            <button onClick={() => setSendMode("schedule")} className={`flex-1 py-2 rounded-full text-xs font-bold ${sendMode === "schedule" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={sendMode === "schedule" ? { backgroundColor: COLORS.primary } : {}}>Schedule</button>
          </div>

          <div className="space-y-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g. Practice time change)" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            <AutoGrowTextarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Message" minRows={2} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none" />
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Send to</p>
              <div className="flex gap-2">
                <button onClick={() => setAudMode("everyone")} className={`flex-1 py-1.5 rounded-full text-[11px] font-bold ${audMode === "everyone" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={audMode === "everyone" ? { backgroundColor: COLORS.primary } : {}}>Everyone</button>
                <button onClick={() => setAudMode("custom")} className={`flex-1 py-1.5 rounded-full text-[11px] font-bold ${audMode === "custom" ? "text-white" : "bg-slate-100 text-slate-600"}`} style={audMode === "custom" ? { backgroundColor: COLORS.primary } : {}}>Specific people</button>
              </div>
            </div>
            {audMode === "custom" && (
              <div className="space-y-2">
                {groups.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {groups.map((g) => { const on = groupIds.includes(g.id); return <button key={g.id} onClick={() => toggle(groupIds, setGroupIds, g.id)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${on ? "text-white" : "bg-white text-slate-600 border-slate-200"}`} style={on ? { backgroundColor: COLORS.primary, borderColor: COLORS.primary } : {}}>{g.name}</button>; })}
                  </div>
                )}
                {players.length > 0 && (
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {players.map((p) => { const on = emails.includes(p.email); const nm = nameOf(p.email); return (
                      <button key={p.email} onClick={() => toggle(emails, setEmails, p.email)} className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                        <span className="text-xs text-slate-700 truncate">{nm || p.email}</span>
                        {on ? <Check className="w-4 h-4 flex-shrink-0" style={{ color: COLORS.success }} /> : <span className="w-4 h-4 rounded border border-slate-300 flex-shrink-0" />}
                      </button>
                    ); })}
                  </div>
                )}
              </div>
            )}
          </div>

          {sendMode === "schedule" && (
            <>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">{repeat === "none" ? "When" : "Starts"}</p>
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Repeat</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {[["none", "Once"], ["daily", "Daily"], ["weekly", "Weekly"], ["custom", "Custom"]].map(([val, lbl]) => (
                    <button key={val} onClick={() => setRepeat(val)} className={`py-1.5 rounded-full text-[11px] font-bold ${repeat === val ? "text-white" : "bg-slate-100 text-slate-600"}`} style={repeat === val ? { backgroundColor: COLORS.primary } : {}}>{lbl}</button>
                  ))}
                </div>
                {repeat === "custom" && (
                  <div className="flex justify-between gap-1 mt-2">
                    {DOW_LETTERS.map((ltr, d) => { const on = customDays.includes(d); return (
                      <button key={d} onClick={() => setCustomDays((arr) => arr.includes(d) ? arr.filter((x) => x !== d) : [...arr, d])} className={`flex-1 h-8 rounded-lg text-[11px] font-bold ${on ? "text-white" : "bg-slate-100 text-slate-500"}`} style={on ? { backgroundColor: COLORS.primary } : {}} aria-label={DOW_ABBR[d]}>{ltr}</button>
                    ); })}
                  </div>
                )}
                {repeat === "weekly" && when && <p className="text-[10px] text-slate-400 mt-1">Repeats every {DOW_ABBR[new Date(when).getDay()]}.</p>}
              </div>
            </>
          )}

          <button onClick={submit} disabled={busy} className="w-full py-2.5 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>{busy ? "Sending…" : sendMode === "now" ? "Send now" : "Schedule it"}</button>
          {sendMode === "now" && <p className="text-[11px] text-slate-400 text-center">Goes out within a few minutes.</p>}

          {list.length > 0 && (
            <div className="pt-2 border-t border-slate-100">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">Notifications</p>
              <ul className="space-y-1.5">
                {list.map((n) => {
                  const rep = recurrenceLabel(n);
                  const sent = n.status === "sent";
                  return (
                    <li key={n.id} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-slate-800 truncate">🔔 {n.title || n.body || "Notification"}</div>
                        <div className="text-[10px] text-slate-500 truncate">{n.body && n.title ? n.body : ""}{sent ? "Sent" : ""}{!sent && n.sendAt ? new Date(tsMillis(n.sendAt)).toLocaleString([], { weekday: rep ? "short" : undefined, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</div>
                      </div>
                      {rep
                        ? <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex-shrink-0 flex items-center gap-0.5" style={{ backgroundColor: COLORS.primary, color: "white" }}><Repeat className="w-2.5 h-2.5" />{rep}</span>
                        : sent ? <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: COLORS.success }} /> : <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex-shrink-0" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.primary }}>Scheduled</span>}
                      <button onClick={() => { if (confirm("Delete this notification?")) Promise.resolve(onDelete(n.id)).catch(reportError("Couldn't delete it")); }} aria-label="Delete" className="text-slate-300 hover:text-red-500 flex-shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Coach-only roster breakdown: who's seen a message / who voted for each poll
// option (and who hasn't). `groups` = [{ label, names: [] }].
export const ViewersModal = ({ title, groups = [], onClose }) => (
  <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
    <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="sticky top-0 bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between z-10">
        <h3 className="text-base font-bold text-slate-900 truncate pr-2">{title}</h3>
        <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0"><X className="w-4 h-4" /></button>
      </div>
      <div className="p-5 space-y-4">
        {groups.map((g, gi) => (
          <div key={gi}>
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1.5">{g.label}</div>
            {g.names.length
              ? <ul className="space-y-1">{g.names.map((n, i) => <li key={i} className="text-sm text-slate-700">{n}</li>)}</ul>
              : <p className="text-xs text-slate-400 italic">Nobody yet.</p>}
          </div>
        ))}
      </div>
    </div>
  </div>
);

// A day separator in a chat feed — a thin line on each side of the date, so
// messages break cleanly from one day to the next (Today / Yesterday / date).
export const DateDivider = ({ label }) => (
  <div className="flex items-center gap-3 my-1.5">
    <div className="flex-1 h-px bg-slate-200" />
    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 flex-shrink-0">{label}</span>
    <div className="flex-1 h-px bg-slate-200" />
  </div>
);

// Fullscreen in-app video player. Chat videos play in a small bubble, which
// is too small to see on a phone, so tapping the expand button opens the
// video here instead — full screen, inside the app, with a big close button.
// No new tab, no leaving the app.
export const VideoViewer = ({ url, onClose }) => {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={onClose}>
      <button onClick={onClose} aria-label="Close video" className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/20 text-white flex items-center justify-center"><X className="w-5 h-5" /></button>
      <video src={url} controls autoPlay playsInline className="max-h-full max-w-full" onClick={(e) => e.stopPropagation()} />
    </div>
  );
};

// A chat link to Train → Documents (sent from the Documents page): a single
// document or a whole folder. Tapping opens Documents on it.
export const TRAIN_LINK_TYPES = ["doc", "folder", "videoLink", "videoFolder"];
export const isTrainLink = (a) => TRAIN_LINK_TYPES.includes(a?.type);
// The text a Train link message carries (for previews / notifications); the
// bubble hides it since the card says the same.
const trainLinkText = (a) => `${a.type === "doc" ? "📄" : a.type === "folder" ? "📁" : "🎬"} ${a.name}`;
export const LibraryLinkCard = ({ a, own, onOpen }) => {
  const isFolder = a.type === "folder" || a.type === "videoFolder";
  const isVideo = a.type === "videoLink" || a.type === "videoFolder";
  const where = isVideo ? "Videos" : "Documents";
  const Icon = isFolder ? Folder : isVideo ? Video : FileText;
  return (
    <button onClick={() => onOpen?.(a)}
      className={`mx-2 my-2 rounded-xl p-2.5 flex items-center gap-2.5 text-left w-[calc(100%-1rem)] ${own ? "bg-white/15" : "bg-white/80"}`}>
      <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: own ? "rgba(255,255,255,0.2)" : COLORS.accentSoft, color: own ? "#fff" : COLORS.accent }}>
        <Icon className="w-4 h-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold truncate">{a.name || (isFolder ? "Folder" : "Document")}</span>
        <span className={`block text-[11px] truncate ${own ? "text-white/75" : "text-slate-500"}`}>
          {isFolder
            ? `${isVideo ? "Video folder" : "Folder"}${a.count ? ` · ${a.count} ${isVideo ? "video" : "item"}${a.count === 1 ? "" : "s"}` : ""}`
            : isVideo ? (a.cat ? `In ${a.subfolder ? `${a.cat} · ${a.subfolder}` : a.cat}` : "Video") : (a.folder ? `In ${a.folder}` : "Document")} · Open in {where} ›
        </span>
      </span>
    </button>
  );
};

export const MessagesPage = ({ onOpenDocument, user, activeTeamId, isOrgAdmin = false, hasOlderMessages = false, onLoadOlder, messages, addMessage, togglePinMessage, deleteMessage, markMessagesRead, voteOnPoll, reactToMessage, rosterCount = 0, chatGroups = [], addChatGroup, deleteChatGroup, updateChatGroup, onPinChannel, groups = [], invites = [], allUsers = [], announcements = [], addAnnouncement, deleteAnnouncement, dms = [], addDM, markDMsRead, scheduled = [], addScheduled, deleteScheduled }) => {
  const isAdmin = user.role === "admin";
  const [input, setInput] = useState("");
  const [showPinned, setShowPinned] = useState(true);
  const [shared, setShared] = useState(false);
  const [pinOnSend, setPinOnSend] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [actionMsg, setActionMsg] = useState(null); // message whose long-press menu is open
  const [dmAction, setDmAction] = useState(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState({ question: "", options: ["", ""] });
  const [uploading, setUploading] = useState(false);
  const [activeChannel, setActiveChannel] = useState(null);
  const [channelModal, setChannelModal] = useState(false);
  const [scheduledModal, setScheduledModal] = useState(false);
  const [viewer, setViewer] = useState(null); // { title, groups } — coach seen/voted breakdown
  const [videoViewer, setVideoViewer] = useState(null); // url of the video playing fullscreen in-app
  const nameByUid = useMemo(() => Object.fromEntries((allUsers || []).map((u) => [u.id, u.name || u.email || "Member"])), [allUsers]);
  // email → display name, for showing roster people by name instead of address.
  const nameByEmail = useMemo(() => Object.fromEntries((allUsers || []).filter((u) => u.email && u.name).map((u) => [u.email.toLowerCase(), u.name])), [allUsers]);
  const rosterPlayers = useMemo(() => (allUsers || []).filter((u) => !isStaffRole(u.role)), [allUsers]);
  const openSeen = (m) => {
    const seenUids = Object.keys(m.readBy || {}).filter((uid) => uid !== m.senderUid);
    const seenSet = new Set(seenUids);
    const seenNames = seenUids.map((uid) => nameByUid[uid] || "Member").sort();
    const notSeen = rosterPlayers.filter((pp) => pp.id !== m.senderUid && !seenSet.has(pp.id)).map((pp) => pp.name || pp.email).sort();
    setViewer({ title: "Seen by", groups: [
      { label: `Seen · ${seenNames.length}`, names: seenNames },
      { label: `Not yet · ${notSeen.length}`, names: notSeen },
    ] });
  };
  const openVoters = async (m) => {
    // Coach-only: read the private vote docs (plus any legacy map entries).
    const votes = { ...(m.votes || {}) };
    try {
      const snap = await getDocs(collection(db, "messages", m.id, "votes"));
      snap.forEach((v) => { votes[v.id] = v.data().option; });
    } catch (e) { reportError("Couldn't load the votes")(e); return; }
    const voterSet = new Set(Object.keys(votes));
    const grps = (m.options || []).map((opt, i) => ({
      label: `${opt} · ${Object.values(votes).filter((v) => v === i).length}`,
      names: Object.entries(votes).filter(([, v]) => v === i).map(([uid]) => nameByUid[uid] || "Member").sort(),
    }));
    const nonVoters = rosterPlayers.filter((pp) => !voterSet.has(pp.id)).map((pp) => pp.name || pp.email).sort();
    grps.push({ label: `Didn't vote · ${nonVoters.length}`, names: nonVoters });
    setViewer({ title: m.question || "Poll results", groups: grps });
  };
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const feedRef = useRef(null);
  const readMarkedRef = useRef(new Set());

  // Which group chats this user is allowed to see (coach sees all). Empty
  // visibleTo = everyone. Filtered client-side, same as event visibility.
  const myGroupIds = useMemo(() => new Set((groups || [])
    .filter((g) => (g.memberUids || []).includes(user.uid) || (g.memberUids || []).includes(user.email))
    .map((g) => g.id)), [groups, user]);
  const visibleChannels = useMemo(() => (chatGroups || []).filter((c) => {
    if (isAdmin) return true;
    const v = c.visibleTo || {};
    const emails = v.emails || []; const uids = v.uids || []; const gids = v.groupIds || [];
    if (!emails.length && !uids.length && !gids.length) return true;
    if (uids.includes(user.uid) || emails.includes(user.email)) return true;
    return gids.some((id) => myGroupIds.has(id));
  }), [chatGroups, isAdmin, myGroupIds, user]);
  const [announceMode, setAnnounceMode] = useState(false);
  // The active team's coach(es), for naming the player's DM thread
  // ("Coach Kelly" instead of a generic "Coach"). The org admin is not a
  // DM participant, so only per-team coaches (role 'admin') count here.
  const teamCoaches = useMemo(() => (allUsers || []).filter((u) => u.role === "admin" && (u.teamIds || []).includes(activeTeamId)), [allUsers, activeTeamId]);
  const coachDmName = useMemo(() => {
    if (teamCoaches.length !== 1) return "Coach";
    const parts = (teamCoaches[0].name || "").trim().split(/\s+/).filter(Boolean);
    return parts.length ? `Coach ${parts[parts.length - 1]}` : "Coach";
  }, [teamCoaches]);
  // Direct messages with the team's coach. Players get one thread with their
  // own team's coach; a coach sees one pill per player who has a thread on
  // their team. The org admin gets none — DMs are player ↔ own team's coach
  // only (decision 2026-11-08).
  // A coach can also START a thread with any player on the team (the
  // thread exists locally until the first message is sent).
  const [startedDm, setStartedDm] = useState(null); // { uid, name }
  const dmThreads = useMemo(() => {
    if (isOrgAdmin) return [];
    if (!isAdmin) return [{ id: "coach-dm", name: coachDmName, dm: true }];
    const byThread = new Map();
    dms.forEach((d) => { if (!byThread.has(d.threadId)) byThread.set(d.threadId, d); });
    const threads = [...byThread.entries()].map(([tid, d]) => ({ id: `dm:${tid}`, name: (dms.find((x) => x.threadId === tid && !x.isCoach)?.senderName) || d.senderName || "Player", dm: true }));
    if (startedDm && !byThread.has(startedDm.uid)) threads.unshift({ id: `dm:${startedDm.uid}`, name: startedDm.name || "Player", dm: true });
    return threads;
  }, [dms, isAdmin, isOrgAdmin, coachDmName, startedDm]);
  const dmPlayers = useMemo(
    () => (isAdmin && !isOrgAdmin ? allUsers.filter((u) => u.role === "player" && u.id !== user.uid) : []),
    [allUsers, isAdmin, isOrgAdmin, user.uid],
  );
  const startDmWith = (uid) => {
    const p = dmPlayers.find((u) => u.id === uid);
    if (!p) return;
    setStartedDm({ uid, name: p.name || p.email || "Player" });
    setActiveChannel(`dm:${uid}`);
  };
  const channels = [
    { id: "team", name: "Team", channel: true },
    ...visibleChannels.map((c) => ({ id: c.id, name: c.name, pinned: !!c.pinned, channel: true })),
    ...dmThreads,
  ];
  const validIds = channels.map((c) => c.id);
  const activeConv = activeChannel && validIds.includes(activeChannel) ? activeChannel : null;
  const activeName = (channels.find((c) => c.id === activeConv) || {}).name || "Chat";
  const effectiveChannel = activeConv || "team";
  const isDM = effectiveChannel === "coach-dm" || effectiveChannel.startsWith("dm:");
  const dmThreadId = !isDM ? null : (effectiveChannel === "coach-dm" ? user.uid : effectiveChannel.slice(3));
  const dmMessages = useMemo(() => {
    if (!isDM) return [];
    const ms = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : 0);
    return dms.filter((d) => d.threadId === dmThreadId).sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
  }, [dms, isDM, dmThreadId]);
  const channelMessages = useMemo(() => messages.filter((m) => (m.channel || "team") === effectiveChannel), [messages, effectiveChannel]);
  // WhatsApp-style notifications for this conversation: the same keys/tags
  // the server uses (functions/lib/notify.js). Opening a chat clears its
  // notifications on the phone; the bell mutes it (8 h / 1 week / always).
  const chatKey = isDM ? `dm_${dmThreadId}` : effectiveChannel === "team" ? `team_${activeTeamId}` : `group_${effectiveChannel}`;
  const notifTag = isDM ? `dm-${dmThreadId}` : `chat-${chatKey}`;
  const muted = isChatMuted(user.notifPrefs, chatKey);
  const [muteOpen, setMuteOpen] = useState(false);
  const convCount = isDM ? dmMessages.length : channelMessages.length;
  useEffect(() => {
    if (activeConv) clearChatNotifications(notifTag);
  }, [activeConv, notifTag, convCount]);
  const setMute = async (until) => {
    setMuteOpen(false);
    try {
      await updateDoc(doc(db, "users", user.uid), { [`notifPrefs.muted.${chatKey}`]: until == null ? deleteField() : until });
      toast(until == null ? "Notifications on for this chat." : until === -1 ? "Muted — you'll still get @mentions." : "Muted. @mentions still come through.", "success");
    } catch (e) { toast("Couldn't change — " + (e?.message || "")); }
  };

  // Downscale + upload an image to Firebase Storage, post as a new message.
  const downscaleImage = (file, maxDim = 1600, quality = 0.86) =>
    new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("toBlob failed")), "image/jpeg", quality);
      };
      img.onerror = () => reject(new Error("Could not read image"));
      img.src = URL.createObjectURL(file);
    });

  const sendImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const blob = await downscaleImage(file);
      // Namespace by channel so Storage rules can gate reads to the channel's
      // audience (a hidden channel's images stay private, like its messages).
      const path = `chat/${activeTeamId}/${effectiveChannel}/${user.uid}/${Date.now()}.jpg`;
      const ref = storageRef(storage, path);
      const snap = await uploadBytes(ref, blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(snap.ref);
      if (isDM) {
        await addDM("", dmThreadId, { attachment: { type: "image", url, path, name: file.name || "photo.jpg" } });
      } else {
        await addMessage("", {
          attachment: { type: "image", url, path, name: file.name || "photo.jpg" },
          channel: effectiveChannel,
        });
      }
    } catch (e) {
      toast("Couldn't send photo — " + (e.message || "check Storage rules?"));
    } finally {
      setUploading(false);
    }
  };

  // File extension from a name, lowercased; fallback when there is none.
  const FILE_MIME_BY_EXT = {
    pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    txt: "text/plain", csv: "text/csv", rtf: "application/rtf",
  };
  const fileExt = (name, fallback) => {
    const parts = String(name || "").split(".");
    const ext = parts.length > 1 ? parts.pop().toLowerCase() : "";
    return ext || fallback;
  };

  // Upload a video file as-is (no downscaling) and post it as a new message.
  const sendVideo = async (file) => {
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) { toast("Video is too big. Keep it under 100 MB."); return; }
    setUploading(true);
    try {
      const ext = fileExt(file.name, "mp4");
      const path = `chat/${activeTeamId}/${effectiveChannel}/${user.uid}/${Date.now()}.${ext}`;
      const ref = storageRef(storage, path);
      const snap = await uploadBytes(ref, file, { contentType: file.type || "video/mp4" });
      const url = await getDownloadURL(snap.ref);
      if (isDM) {
        await addDM("", dmThreadId, { attachment: { type: "video", url, path, name: file.name || "video.mp4" } });
      } else {
        await addMessage("", {
          attachment: { type: "video", url, path, name: file.name || "video.mp4" },
          channel: effectiveChannel,
        });
      }
    } catch (e) {
      toast("Couldn't send video: " + (e.message || "check Storage rules?"));
    } finally {
      setUploading(false);
    }
  };

  // Upload a document as-is and post it as a new message.
  const sendFile = async (file) => {
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast("File is too big. Keep it under 25 MB."); return; }
    setUploading(true);
    try {
      const ext = fileExt(file.name, "bin");
      const path = `chat/${activeTeamId}/${effectiveChannel}/${user.uid}/${Date.now()}.${ext}`;
      const ref = storageRef(storage, path);
      // Some browsers report an empty type for Office files; Storage rules
      // reject application/octet-stream, so infer it from the extension.
      const snap = await uploadBytes(ref, file, { contentType: file.type || FILE_MIME_BY_EXT[ext] || "application/octet-stream" });
      const url = await getDownloadURL(snap.ref);
      if (isDM) {
        await addDM("", dmThreadId, { attachment: { type: "file", url, path, name: file.name || "file" } });
      } else {
        await addMessage("", {
          attachment: { type: "file", url, path, name: file.name || "file" },
          channel: effectiveChannel,
        });
      }
    } catch (e) {
      toast("Couldn't send file: " + (e.message || "check Storage rules?"));
    } finally {
      setUploading(false);
    }
  };

  // Jump to the newest messages on opening a conversation. After that, only
  // follow new messages if the user is already near the bottom — if they
  // scrolled up to read older messages, stay put and let them read.
  // Deferred across two frames so it lands after layout (and late-loading
  // images) settle, so a chat always opens pinned to the bottom.
  const nearBottomRef = useRef(true);
  const lastConvRef = useRef(null);
  useEffect(() => {
    if (shared || !activeConv) return;
    const isNewConv = lastConvRef.current !== activeConv;
    lastConvRef.current = activeConv;
    if (!isNewConv && !nearBottomRef.current) return;
    const toBottom = () => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; };
    toBottom();
    const r1 = requestAnimationFrame(() => { toBottom(); requestAnimationFrame(toBottom); });
    const t = setTimeout(toBottom, 120);
    return () => { cancelAnimationFrame(r1); clearTimeout(t); };
  }, [channelMessages, dmMessages, shared, activeConv]);
  // As the message box grows (up to 5 lines) the feed gets shorter; keep the
  // newest messages in view if the user was already at the bottom.
  useLayoutEffect(() => {
    if (nearBottomRef.current && feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [input]);
  // Track whether the user is near the bottom of the feed, so new messages
  // only pull the view down when they're already reading the newest ones.
  const onFeedScroll = (e) => {
    const el = e.currentTarget;
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  };

  // Mark every visible message (that isn't ours and we haven't read) as read.
  useEffect(() => {
    if (shared || !activeConv) return;
    const toMark = channelMessages
      .filter((m) => m.senderUid !== user.uid)
      .filter((m) => !m.readBy?.[user.uid])
      .filter((m) => !readMarkedRef.current.has(m.id))
      .map((m) => m.id);
    if (!toMark.length) return;
    toMark.forEach((id) => readMarkedRef.current.add(id));
    markMessagesRead(toMark).catch(() => {
      toMark.forEach((id) => readMarkedRef.current.delete(id));
    });
  }, [channelMessages, shared, activeConv, user.uid, markMessagesRead]);

  // Same for DMs: opening a thread marks its messages read (so the thread's
  // unread badge clears, like a channel's).
  const dmReadMarkedRef = useRef(new Set());
  useEffect(() => {
    if (shared || !activeConv || !isDM) return;
    const toMark = dmMessages
      .filter((d) => d.senderUid !== user.uid)
      .filter((d) => !d.readBy?.[user.uid])
      .filter((d) => !dmReadMarkedRef.current.has(d.id))
      .map((d) => d.id);
    if (!toMark.length) return;
    toMark.forEach((id) => dmReadMarkedRef.current.add(id));
    markDMsRead?.(toMark).catch(() => {
      toMark.forEach((id) => dmReadMarkedRef.current.delete(id));
    });
  }, [dmMessages, shared, activeConv, isDM, user.uid, markDMsRead]);

  const isOwn = (m) => m.senderUid === user.uid;
  const readByCount = (m) => Object.keys(m.readBy || {}).filter((uid) => uid !== user.uid).length;

  const send = async () => {
    if (!input.trim()) return;
    const text = input.trim();
    const wasReply = replyTo;
    setInput("");
    setReplyTo(null);
    try {
      if (isDM) {
        await addDM(text, dmThreadId);
      } else if (announceMode && isAdmin) {
        await addAnnouncement(text, "");
        setAnnounceMode(false);
      } else {
        await addMessage(text, { pinned: isAdmin && pinOnSend, replyTo: wasReply, channel: effectiveChannel });
        if (pinOnSend) setPinOnSend(false);
      }
    } catch (e) {
      toast("Couldn't send — " + (e.message || "check Firestore rules."));
      setInput(text);
      setReplyTo(wasReply);
    }
  };

  const sendPoll = async () => {
    const opts = pollDraft.options.map((o) => o.trim()).filter(Boolean);
    if (!pollDraft.question.trim() || opts.length < 2) return;
    try {
      await addMessage("", { poll: { question: pollDraft.question.trim(), options: opts }, channel: effectiveChannel });
      setPollDraft({ question: "", options: ["", ""] });
      setPollOpen(false);
    } catch (e) {
      toast("Couldn't create poll — " + (e.message || ""));
    }
  };

  const togglePin = (m) => togglePinMessage(m.id, m.pinned).catch(reportError("Couldn't pin the message"));
  const delMsg = (id) => {
    if (!confirm("Delete this message for everyone?")) return;
    deleteMessage(id).catch(reportError("Couldn't delete the message"));
  };
  const startReply = (m) => setReplyTo({ id: m.id, sender: m.sender, text: m.text, kind: m.kind, question: m.question });
  const cancelReply = () => setReplyTo(null);
  const copyMsg = async (m) => {
    const text = m.kind === "poll" ? m.question : m.text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied", "success");
    } catch { /* clipboard unavailable — text is still selectable manually */ }
  };

  const pinnedMsgs = channelMessages.filter((m) => m.pinned);
  const mediaMsgs = channelMessages.filter((m) => m.attachment);
  const linkMsgs = channelMessages.filter((m) => URL_RE.test(m.text || ""));

  const AttIcon = ({ type }) => type === "image" ? <ImageIcon className="w-4 h-4" /> : type === "video" ? <Video className="w-4 h-4" /> : <FileText className="w-4 h-4" />;

  // Build the message stream with date dividers interleaved.
  const stream = useMemo(() => {
    // In the Team channel, announcements appear inline as broadcast cards,
    // interleaved with messages by time — one place for team-wide comms.
    const items = channelMessages.map((m) => ({ ts: m.createdAt, kind: "msg", message: m }));
    if (effectiveChannel === "team") {
      announcements.forEach((a) => items.push({ ts: a.createdAt, kind: "announcement", announcement: a }));
    }
    const ms = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : 0);
    items.sort((a, b) => ms(a.ts) - ms(b.ts));
    const out = [];
    let lastDay = null;
    items.forEach((it) => {
      const day = formatDayKey(it.ts);
      if (day !== lastDay) {
        out.push({ kind: "divider", id: `div-${day}`, label: formatDateHeader(it.ts) });
        lastDay = day;
      }
      out.push(it.kind === "announcement" ? { kind: "announcement", id: `a-${it.announcement.id}`, announcement: it.announcement } : { kind: "msg", id: it.message.id, message: it.message });
    });
    return out;
  }, [channelMessages, announcements, effectiveChannel]);

  // DM thread with the same day dividers interleaved (kept chronological).
  const dmStream = useMemo(() => {
    const out = [];
    let lastDay = null;
    (dmMessages || []).forEach((d) => {
      const day = formatDayKey(d.createdAt);
      if (day && day !== lastDay) { out.push({ kind: "divider", id: `dmdiv-${day}`, label: formatDateHeader(d.createdAt) }); lastDay = day; }
      out.push({ kind: "dm", id: d.id, dm: d });
    });
    return out;
  }, [dmMessages]);

  const msOf = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : 0);
  const convMetaById = useMemo(() => {
    const meta = {};
    const bump = (id, t, raw, text, sender) => {
      const cur = meta[id] || { lastTs: 0, lastAt: null, lastText: "", lastSender: "", unread: 0 };
      if (t >= cur.lastTs) { cur.lastTs = t; cur.lastAt = raw; cur.lastText = text; cur.lastSender = sender; }
      meta[id] = cur;
    };
    messages.forEach((m) => {
      const id = m.channel || "team";
      const text = m.kind === "poll" ? `📊 ${m.question || "Poll"}` : (m.attachment?.type === "image" ? "📷 Photo" : m.attachment?.type === "video" ? "🎬 Video" : m.attachment?.type === "file" ? "📎 File" : (m.text || ""));
      bump(id, msOf(m.createdAt), m.createdAt, text, m.sender);
      if (m.senderUid !== user.uid && !m.readBy?.[user.uid]) meta[id].unread = (meta[id].unread || 0) + 1;
    });
    dms.forEach((d) => {
      const id = isAdmin ? `dm:${d.threadId}` : "coach-dm";
      bump(id, msOf(d.createdAt), d.createdAt, d.text || "", d.senderName);
      if (d.senderUid !== user.uid && !d.readBy?.[user.uid]) meta[id].unread = (meta[id].unread || 0) + 1;
    });
    return meta;
  }, [messages, dms, isAdmin, user.uid]);
  const convList = channels
    .map((c) => ({ ...c, meta: convMetaById[c.id] || {} }))
    .sort((a, b) => {
      if (a.id === "team") return -1;
      if (b.id === "team") return 1;
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.meta.lastTs || 0) - (a.meta.lastTs || 0);
    });
  // Professional inbox layout: channels first (Team, then custom), then
  // direct messages — never mixed into one flat list.
  const channelConvs = convList.filter((c) => c.channel);
  const dmConvs = convList.filter((c) => c.dm);

  // One conversation row, shared by the Channels and Direct messages
  // sections (avatar, name, unread badge, last-message preview, time).
  const convRow = (c) => {
    const meta = c.meta || {};
    const preview = meta.lastText
      ? `${!c.dm && meta.lastSender ? meta.lastSender.split(" ")[0] + ": " : ""}${meta.lastText}`
      : "No messages yet";
    return (
      <li key={c.id} className="flex items-center bg-white hover:bg-slate-50">
        <button onClick={() => { setActiveChannel(c.id); setShared(false); }} className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold" style={{ backgroundColor: c.dm ? "#94a3b8" : COLORS.primary }}>{c.dm ? (c.name || "?")[0]?.toUpperCase() : <Hash className="w-4 h-4" />}</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {(c.id === "team" || c.pinned) && <Pin className="w-3 h-3 flex-shrink-0" style={{ color: c.id === "team" ? COLORS.accent : "#94a3b8" }} />}
              <span className="text-sm font-bold text-slate-900 truncate">{c.name}</span>
              {meta.unread > 0 && <span className="text-[10px] font-bold text-white rounded-full px-1.5 min-w-[18px] text-center flex-shrink-0" style={{ backgroundColor: COLORS.accent }}>{meta.unread}</span>}
            </div>
            <div className="text-xs text-slate-500 truncate mt-0.5">{preview}</div>
          </div>
          {meta.lastAt && <span className="text-[9px] text-slate-400 flex-shrink-0 self-start">{formatTime(meta.lastAt)}</span>}
        </button>
        {isAdmin && c.channel && c.id !== "team" && onPinChannel && (
          <button onClick={() => onPinChannel(c.id, !c.pinned)} title={c.pinned ? "Unpin" : "Pin to top"} className={`px-3 py-3 flex-shrink-0 ${c.pinned ? "text-orange-500" : "text-slate-300"} hover:text-orange-500`}><Pin className="w-4 h-4" /></button>
        )}
      </li>
    );
  };

  if (!activeConv) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between shrink-0">
          <div><h3 className="font-bold text-slate-900 text-sm">Messages</h3><p className="text-[10px] text-slate-500">{getTeam(activeTeamId).shortName} · {rosterCount} on roster</p></div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <button onClick={() => setScheduledModal(true)} title="Scheduled reminders & polls" className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1" style={{ backgroundColor: COLORS.bg, color: COLORS.primary }}>
                <Clock className="w-3 h-3" /> Scheduled
              </button>
              <button onClick={() => setChannelModal(true)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1 text-white" style={{ backgroundColor: COLORS.primary }}>
                <Plus className="w-3 h-3" /> Group
              </button>
            </div>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: COLORS.bg }}>
          <div className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Channels</div>
          <ul className="divide-y divide-slate-100">
            {channelConvs.map((c) => convRow(c))}
          </ul>
          {!isOrgAdmin && (
            <>
              <div className="px-4 pt-4 pb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Direct messages</div>
              {dmPlayers.length > 0 && (
                <div className="px-4 pb-2">
                  <select value="" onChange={(e) => startDmWith(e.target.value)} aria-label="Message a player" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-xs bg-white text-slate-600">
                    <option value="">+ Message a player…</option>
                    {dmPlayers.map((p) => <option key={p.id} value={p.id}>{p.name || p.email}</option>)}
                  </select>
                </div>
              )}
              {dmConvs.length === 0 ? (
                <p className="px-4 py-2 text-xs text-slate-400 italic">No direct messages yet.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {dmConvs.map((c) => convRow(c))}
                </ul>
              )}
            </>
          )}
        </div>
        {channelModal && (
          <ChannelModal chatGroups={chatGroups} groups={groups} roster={invites} nameByEmail={nameByEmail} onCreate={addChatGroup} onDelete={deleteChatGroup} onUpdate={updateChatGroup} onClose={() => setChannelModal(false)} />
        )}
        {scheduledModal && (
          <ScheduledModal scheduled={scheduled} onAdd={addScheduled} onDelete={deleteScheduled} chatGroups={chatGroups} groups={groups} roster={invites} nameByEmail={nameByEmail} onClose={() => setScheduledModal(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between gap-2 shrink-0">
        <button onClick={() => { setActiveChannel(null); setShared(false); }} className="flex items-center gap-2 min-w-0">
          <ChevronLeft className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <div className="min-w-0 text-left"><h3 className="font-bold text-slate-900 text-sm truncate">{activeName}</h3><p className="text-[10px] text-slate-500">{rosterCount} on roster</p></div>
        </button>
        <button onClick={() => setMuteOpen(true)} aria-label={muted ? "Chat muted — change" : "Mute notifications"} className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ml-auto" style={{ backgroundColor: muted ? COLORS.accentSoft : "transparent" }}>
          {muted ? <BellOff className="w-4 h-4" style={{ color: COLORS.primary }} /> : <Bell className="w-4 h-4 text-slate-400" />}
        </button>
        <button onClick={() => setShared(!shared)} className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1.5 flex-shrink-0" style={shared ? { backgroundColor: COLORS.primary, color: "white" } : { backgroundColor: COLORS.bg, color: COLORS.textSecondary }}>
          <Layers className="w-3 h-3" /> {shared ? "Chat" : "Shared"}
        </button>
      </div>

      {muteOpen && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-end justify-center" onClick={() => setMuteOpen(false)} role="dialog" aria-label="Mute notifications">
          <div className="w-full max-w-md bg-white rounded-t-3xl p-4 pb-[calc(16px+env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-base text-slate-900">{muted ? `Muted · ${mutedLabel(user.notifPrefs?.muted?.[chatKey])}` : `Mute ${activeName}`}</h3>
            <p className="text-[12px] text-slate-500 mb-3">You won't get notifications from this chat. Messages still arrive, and @mentions still notify you.</p>
            {[["8 hours", 8], ["1 week", 168], ["Always", -1]].map(([label, hours]) => (
              <button key={label} onClick={() => setMute(hours === -1 ? -1 : Date.now() + hours * 3600e3)} className="w-full h-12 mb-2 rounded-2xl bg-slate-100 text-sm font-bold text-slate-800">{label}</button>
            ))}
            {muted && <button onClick={() => setMute(null)} className="w-full h-12 rounded-2xl text-sm font-bold text-white" style={{ backgroundColor: COLORS.primary }}>Unmute</button>}
          </div>
        </div>
      )}
      {channelModal && (
        <ChannelModal chatGroups={chatGroups} groups={groups} roster={invites} nameByEmail={nameByEmail} onCreate={addChatGroup} onDelete={deleteChatGroup} onUpdate={updateChatGroup} onClose={() => setChannelModal(false)} />
      )}
      {viewer && (
        <ViewersModal title={viewer.title} groups={viewer.groups} onClose={() => setViewer(null)} />
      )}
      {videoViewer && (
        <VideoViewer url={videoViewer} onClose={() => setVideoViewer(null)} />
      )}

      {shared ? (
        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-5" style={{ backgroundColor: COLORS.bg }}>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Photos & Files</h4>
            {mediaMsgs.length === 0 ? <p className="text-xs text-slate-400 italic">No files shared yet.</p> : (
              <div className="grid grid-cols-3 gap-2">
                {mediaMsgs.map((m) => (
                  m.attachment?.type === "video" && m.attachment.url ? (
                    <button key={m.id} onClick={() => setVideoViewer(m.attachment.url)} aria-label="Watch video fullscreen" className="aspect-square rounded-xl overflow-hidden bg-slate-100 block relative">
                      <video src={m.attachment.url} preload="metadata" className="w-full h-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center"><span className="w-10 h-10 rounded-full bg-black/60 flex items-center justify-center"><Play className="w-5 h-5 text-white fill-white ml-0.5" /></span></span>
                    </button>
                  ) : m.attachment?.type === "image" && m.attachment.url ? (
                    <a key={m.id} href={m.attachment.url} target="_blank" rel="noopener noreferrer" className="aspect-square rounded-xl overflow-hidden bg-slate-100 block">
                      <img src={m.attachment.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </a>
                  ) : m.attachment?.type === "file" && m.attachment.url ? (
                    <a key={m.id} href={m.attachment.url} target="_blank" rel="noopener noreferrer" className="bg-white rounded-xl border border-slate-100 p-3 flex flex-col items-center text-center">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><AttIcon type={m.attachment.type} /></div>
                      <div className="text-[10px] font-semibold text-slate-700 truncate w-full">{m.attachment.name}</div>
                      <div className="text-[9px] text-slate-400">{m.sender.split(" ")[0]}</div>
                    </a>
                  ) : isTrainLink(m.attachment) ? (
                    <button key={m.id} onClick={() => onOpenDocument?.(m.attachment)} className="bg-white rounded-xl border border-slate-100 p-3 flex flex-col items-center text-center">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}>{m.attachment.type === "folder" || m.attachment.type === "videoFolder" ? <Folder className="w-4 h-4" /> : m.attachment.type === "videoLink" ? <Video className="w-4 h-4" /> : <FileText className="w-4 h-4" />}</div>
                      <div className="text-[10px] font-semibold text-slate-700 truncate w-full">{m.attachment.name}</div>
                      <div className="text-[9px] text-slate-400">{m.sender.split(" ")[0]}</div>
                    </button>
                  ) : (
                    <div key={m.id} className="bg-white rounded-xl border border-slate-100 p-3 flex flex-col items-center text-center">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><AttIcon type={m.attachment.type} /></div>
                      <div className="text-[10px] font-semibold text-slate-700 truncate w-full">{m.attachment.name}</div>
                      <div className="text-[9px] text-slate-400">{m.sender.split(" ")[0]}</div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Links</h4>
            {linkMsgs.length === 0 ? <p className="text-xs text-slate-400 italic">No links shared yet.</p> : (
              <ul className="space-y-2">
                {linkMsgs.map((m) => { const url = (m.text.match(URL_RE) || [])[0]; return (
                  <li key={m.id} className="bg-white rounded-xl border border-slate-100 p-3 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#E0F2FE", color: "#0284c7" }}><LinkIcon className="w-4 h-4" /></div>
                    <div className="flex-1 min-w-0"><div className="text-xs font-semibold text-slate-900 truncate">{url}</div><div className="text-[10px] text-slate-400">shared by {m.sender.split(" ")[0]}</div></div>
                  </li>
                ); })}
              </ul>
            )}
          </div>
        </div>
      ) : isDM ? (
        <>
          <div ref={feedRef} onScroll={onFeedScroll} className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: COLORS.bg }}>
            <div className="min-h-full flex flex-col justify-end px-3 py-4">
            {isLoading(dms) ? <LoadingNote /> : dmMessages.length === 0 && <p className="text-center text-xs text-slate-400 italic py-6">{isAdmin ? "No messages in this thread yet." : "Message your coach privately. Only you and your team's coach can see this."}</p>}
            {dmStream.map((item, idx) => {
              if (item.kind === "divider") return <div key={item.id} className="pt-3"><DateDivider label={item.label} /></div>;
              const d = item.dm;
              const own = d.senderUid === user.uid;
              const sameSender = (o) => o && o.kind !== "divider" && o.dm?.senderUid === d.senderUid
                && Math.abs(tsMs(o.dm.createdAt) - tsMs(d.createdAt)) < GROUP_GAP_MS;
              const first = !sameSender(dmStream[idx - 1]);
              const last = !sameSender(dmStream[idx + 1]);
              return (
                <div key={d.id} className={`flex flex-col ${own ? "items-end" : "items-start"} ${first ? "mt-3" : "mt-0.5"}`}>
                  {!own && first && <div className="px-3 mb-0.5 text-[11px] font-semibold text-slate-500">{d.senderName}{d.isCoach ? " · Coach" : ""}</div>}
                  <LongPress onLong={() => (d.text ? setDmAction(d) : null)} className="max-w-[78%] select-none">
                    <div className="overflow-hidden" style={{ borderRadius: bubbleRadius(own, first, last), backgroundColor: own ? COLORS.primary : IOS_GRAY, color: own ? "#fff" : "#0F172A" }}>
                      {d.attachment?.type === "image" && d.attachment.url && (
                        <img src={d.attachment.url} alt="" className="w-full max-h-80 object-cover" loading="lazy" />
                      )}
                      {d.attachment?.type === "video" && d.attachment.url && (
                        <div className="relative">
                          <video src={d.attachment.url} controls playsInline preload="metadata" className="w-full max-h-80 object-cover" />
                          <button onClick={() => setVideoViewer(d.attachment.url)} aria-label="Watch fullscreen" title="Watch fullscreen" className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"><Maximize2 className="w-4 h-4" /></button>
                        </div>
                      )}
                      {d.attachment?.type === "file" && d.attachment.url && (
                        <a href={d.attachment.url} target="_blank" rel="noopener noreferrer" className={`mx-2 my-2 rounded-xl p-2 flex items-center gap-2 ${own ? "bg-white/15" : "bg-white/70"}`}><AttIcon type={d.attachment.type} /><span className="text-[12px] font-semibold truncate">{d.attachment.name}</span></a>
                      )}
                      {d.text && <p className="px-3.5 py-2 text-[15px] leading-snug break-words"><Linkify>{d.text}</Linkify></p>}
                    </div>
                  </LongPress>
                  {last && <div className="mt-1 px-1 text-[11px] text-slate-400">{formatTime(d.createdAt)}</div>}
                </div>
              );
            })}
            </div>
          </div>
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ""; }} />
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendVideo(f); e.target.value = ""; }} />
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ""; }} />
          <ChatComposer
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onSend={send}
            uploading={uploading}
            placeholder={isAdmin ? "Reply" : "Message your coach"}
            actions={[
              { key: "photo", label: "Photo", icon: Camera, disabled: uploading, onClick: () => photoInputRef.current?.click() },
              { key: "video", label: "Video", icon: Video, disabled: uploading, onClick: () => videoInputRef.current?.click() },
              { key: "file", label: "File", icon: Paperclip, disabled: uploading, onClick: () => fileInputRef.current?.click() },
            ]}
          />
          {dmAction && (
            <MessageActionSheet
              preview={dmAction.text}
              own={dmAction.senderUid === user.uid}
              actions={[{ label: "Copy", icon: Copy, onClick: () => copyMsg(dmAction) }]}
              onClose={() => setDmAction(null)}
            />
          )}
        </>
      ) : (
        <>
          {pinnedMsgs.length > 0 && (
            <div className="bg-orange-50 border-b border-orange-100 shrink-0">
              <button onClick={() => setShowPinned(!showPinned)} className="w-full px-4 py-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: COLORS.accent }}><Pin className="w-3 h-3" /> {pinnedMsgs.length} Pinned</span>
                {showPinned ? <ChevronUp className="w-3.5 h-3.5 text-orange-400" /> : <ChevronDown className="w-3.5 h-3.5 text-orange-400" />}
              </button>
              {showPinned && <ul className="px-4 pb-2 space-y-1">{pinnedMsgs.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-xs"><span className="font-bold text-slate-700">{m.sender.split(" ")[0]}:</span><span className="text-slate-600 truncate flex-1">{m.text}</span>{isAdmin && <button onClick={() => togglePin(m)} className="text-orange-400"><X className="w-3 h-3" /></button>}</li>
              ))}</ul>}
            </div>
          )}

          <div ref={feedRef} onScroll={onFeedScroll} className="flex-1 min-h-0 overflow-y-auto" style={{ backgroundColor: COLORS.bg }}>
            <div className="min-h-full flex flex-col justify-end px-3 py-4">
            {hasOlderMessages && onLoadOlder && (
              <button onClick={onLoadOlder} className="self-center text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-500">Load older messages</button>
            )}
            {isLoading(messages) && <p className="text-center text-xs text-slate-400 py-6">Loading messages…</p>}
            {!isLoading(messages) && stream.length === 0 && <p className="text-center text-xs text-slate-400 italic py-6">No messages here yet. Say hello!</p>}
            {stream.map((item, idx) => {
              if (item.kind === "divider") return <div key={item.id} className="pt-3"><DateDivider label={item.label} /></div>;
              if (item.kind === "announcement") {
                const a = item.announcement;
                return (
                  <div key={item.id} className="mt-3 rounded-2xl p-3.5 shadow-sm border" style={{ backgroundColor: COLORS.accentSoft, borderColor: COLORS.accent }}>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5" style={{ color: COLORS.accent }}><Bell className="w-3 h-3" /> Announcement</span>
                      {isAdmin && deleteAnnouncement && <button onClick={() => { if (confirm("Delete this announcement?")) deleteAnnouncement(a.id).catch(reportError("Couldn't delete the announcement")); }} className="text-slate-400 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                    <div className="text-sm font-bold text-slate-900 mt-1">{a.title}</div>
                    {a.body && <div className="text-xs text-slate-600 mt-0.5 leading-snug">{a.body}</div>}
                  </div>
                );
              }
              const m = item.message;
              const own = isOwn(m);
              // iMessage-style grouping: consecutive messages from one sender
              // (within 5 min) share one name, one avatar and one timestamp.
              const sameSender = (o) => o && o.kind === "msg" && o.message.senderUid === m.senderUid
                && Math.abs(tsMs(o.message.createdAt) - tsMs(m.createdAt)) < GROUP_GAP_MS;
              const first = !sameSender(stream[idx - 1]);
              const last = !sameSender(stream[idx + 1]);
              const seenN = own ? readByCount(m) : 0;
              const reacted = m.reactions && Object.keys(m.reactions).length > 0;
              const status = seenN ? `Read by ${seenN}` : "Delivered";
              return (
                <div key={m.id} className={`flex items-end gap-2 ${own ? "justify-end" : "justify-start"} ${first ? "mt-3" : "mt-0.5"} ${reacted ? "pt-2.5" : ""}`}>
                  {!own && (last ? <Avatar initials={m.initials} size={28} bg={m.isCoach ? COLORS.primary : "#94a3b8"} className="flex-shrink-0" /> : <div className="w-7 flex-shrink-0" />)}
                  <div className={`max-w-[78%] flex flex-col ${own ? "items-end" : "items-start"}`}>
                    {!own && first && (
                      <div className="flex items-baseline gap-1.5 mb-0.5 px-3">
                        <span className="text-[11px] font-semibold text-slate-500">{m.sender}</span>
                        {m.isCoach && <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: COLORS.accent }}>Coach</span>}
                      </div>
                    )}
                    {m.replyToId && m.replyToSender && (
                      <div className="text-[11px] mb-0.5 px-3 py-1 rounded-2xl max-w-full border border-slate-200 bg-white/70 text-slate-500 truncate">
                        <Reply className="w-3 h-3 inline -mt-0.5 mr-1" /><span className="font-semibold text-slate-600">{m.replyToSender}</span> {m.replyToText}
                      </div>
                    )}
                    <LongPress onLong={() => setActionMsg(m)} className="relative max-w-full select-none">
                      <ReactionBadge reactions={m.reactions} myUid={user.uid} own={own} onClick={() => setActionMsg(m)} />
                      {m.kind === "poll" ? (
                        <PollCard message={m} own={own} myUid={user.uid} onVote={(idx2) => voteOnPoll(m.id, idx2)} isAdmin={isAdmin} onSeeVoters={() => openVoters(m)} />
                      ) : (
                        <div className="overflow-hidden" style={{ borderRadius: bubbleRadius(own, first, last), backgroundColor: own ? COLORS.primary : IOS_GRAY, color: own ? "#fff" : "#0F172A" }}>
                          {m.attachment?.type === "image" && m.attachment.url && (
                            <a href={m.attachment.url} target="_blank" rel="noopener noreferrer" className="block">
                              <img src={m.attachment.url} alt="" className="w-full max-h-80 object-cover" loading="lazy" />
                            </a>
                          )}
                          {m.attachment?.type === "video" && m.attachment.url && (
                            <div className="relative">
                              <video src={m.attachment.url} controls playsInline preload="metadata" className="w-full max-h-80 object-cover" />
                              <button onClick={() => setVideoViewer(m.attachment.url)} aria-label="Watch fullscreen" title="Watch fullscreen" className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center"><Maximize2 className="w-4 h-4" /></button>
                            </div>
                          )}
                          {m.text && !(isTrainLink(m.attachment) && m.text === trainLinkText(m.attachment)) && <p className="text-[15px] leading-snug break-words px-3.5 py-2"><Linkify>{m.text}</Linkify></p>}
                          {isTrainLink(m.attachment) ? (
                            <LibraryLinkCard a={m.attachment} own={own} onOpen={onOpenDocument} />
                          ) : m.attachment && m.attachment.type !== "image" && m.attachment.type !== "video" && (
                            m.attachment.type === "file" && m.attachment.url ? (
                              <a href={m.attachment.url} target="_blank" rel="noopener noreferrer" className={`mx-2 my-2 rounded-xl p-2 flex items-center gap-2 ${own ? "bg-white/15" : "bg-white/70"}`}><AttIcon type={m.attachment.type} /><span className="text-[12px] font-semibold truncate">{m.attachment.name}</span></a>
                            ) : (
                              <div className={`mx-2 my-2 rounded-xl p-2 flex items-center gap-2 ${own ? "bg-white/15" : "bg-white/70"}`}><AttIcon type={m.attachment.type} /><span className="text-[12px] font-semibold truncate">{m.attachment.name}</span></div>
                            )
                          )}
                        </div>
                      )}
                    </LongPress>
                    {last && (
                      <div className="flex items-center gap-1 mt-1 px-1 text-[11px] text-slate-400">
                        {m.pinned && <Pin className="w-3 h-3 text-orange-500" />}
                        <span>{formatTime(m.createdAt)}</span>
                        {own && (isAdmin
                          ? <button onClick={() => openSeen(m)} className="font-medium hover:underline">· {status}</button>
                          : <span className="font-medium">· {status}</span>)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            </div>
          </div>

          {pollOpen && (
            <div className="bg-white border-t border-slate-200 px-4 py-3 space-y-2 shrink-0">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><BarChart3 className="w-3 h-3" /> Create poll</span>
                <button onClick={() => { setPollOpen(false); setPollDraft({ question: "", options: ["", ""] }); }} className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
              </div>
              <input value={pollDraft.question} onChange={(e) => setPollDraft({ ...pollDraft, question: e.target.value })} placeholder="Ask the team a question…" className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
              {pollDraft.options.map((opt, i) => (
                <div key={i} className="flex gap-2">
                  <input value={opt} onChange={(e) => { const copy = [...pollDraft.options]; copy[i] = e.target.value; setPollDraft({ ...pollDraft, options: copy }); }} placeholder={`Option ${i + 1}`} className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200" />
                  {pollDraft.options.length > 2 && (
                    <button onClick={() => setPollDraft({ ...pollDraft, options: pollDraft.options.filter((_, j) => j !== i) })} className="text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                {pollDraft.options.length < 4 && (
                  <button onClick={() => setPollDraft({ ...pollDraft, options: [...pollDraft.options, ""] })} className="flex-1 py-2 rounded-full bg-slate-100 text-xs font-bold text-slate-600">+ Option</button>
                )}
                <button onClick={sendPoll} disabled={!pollDraft.question.trim() || pollDraft.options.filter((o) => o.trim()).length < 2} className="flex-1 py-2 rounded-full text-xs font-bold uppercase tracking-wider text-white disabled:opacity-40" style={{ backgroundColor: COLORS.primary }}>Send poll</button>
              </div>
            </div>
          )}

          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = ""; }} />
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendVideo(f); e.target.value = ""; }} />
          <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.rtf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ""; }} />
          <ChatComposer
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onSend={send}
            uploading={uploading}
            placeholder={replyTo ? `Reply to ${replyTo.sender}` : "Message"}
            actions={[
              { key: "photo", label: "Photo", icon: Camera, disabled: uploading, onClick: () => photoInputRef.current?.click() },
              { key: "video", label: "Video", icon: Video, disabled: uploading, onClick: () => videoInputRef.current?.click() },
              { key: "file", label: "File", icon: Paperclip, disabled: uploading, onClick: () => fileInputRef.current?.click() },
              { key: "poll", label: "Poll", icon: BarChart3, active: pollOpen, onClick: () => setPollOpen(!pollOpen) },
              ...(isAdmin ? [{ key: "pin", label: "Pin next", icon: Pin, active: pinOnSend, onClick: () => setPinOnSend(!pinOnSend) }] : []),
              ...(isAdmin && effectiveChannel === "team" ? [{ key: "announce", label: "Announce", icon: Bell, active: announceMode, onClick: () => setAnnounceMode(!announceMode) }] : []),
            ]}
            banner={<>
              {replyTo && (
                <div className="px-4 py-2 flex items-center gap-2 border-b border-slate-100" style={{ backgroundColor: COLORS.accentSoft }}>
                  <Reply className="w-3.5 h-3.5 flex-shrink-0" style={{ color: COLORS.primary }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-bold text-slate-700">Replying to {replyTo.sender}</div>
                    <div className="text-[11px] text-slate-600 truncate">{replyTo.kind === "poll" ? `📊 ${replyTo.question}` : replyTo.text}</div>
                  </div>
                  <button onClick={cancelReply} aria-label="Cancel reply" className="text-slate-400 hover:text-slate-700"><X className="w-4 h-4" /></button>
                </div>
              )}
              {isAdmin && pinOnSend && <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><Pin className="w-3 h-3" /> Next message will be pinned</div>}
              {isAdmin && announceMode && <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ backgroundColor: COLORS.accentSoft, color: COLORS.accent }}><Bell className="w-3 h-3" /> Posting as an announcement to the whole team</div>}
            </>}
          />
          {actionMsg && (
            <MessageActionSheet
              preview={actionMsg.kind === "poll" ? `📊 ${actionMsg.question}` : (actionMsg.text || (actionMsg.attachment ? `📎 ${actionMsg.attachment.name || actionMsg.attachment.type}` : ""))}
              own={isOwn(actionMsg)}
              myReaction={(actionMsg.reactions || {})[user.uid]}
              onReact={reactToMessage ? (r) => reactToMessage(actionMsg.id, r).catch(reportError("Couldn't save your reaction")) : null}
              actions={[
                { label: "Reply", icon: Reply, onClick: () => startReply(actionMsg) },
                ...((actionMsg.text || actionMsg.kind === "poll") ? [{ label: "Copy", icon: Copy, onClick: () => copyMsg(actionMsg) }] : []),
                ...(isAdmin ? [{ label: actionMsg.pinned ? "Unpin" : "Pin", icon: Pin, onClick: () => togglePin(actionMsg) }] : []),
                ...(isAdmin && actionMsg.kind === "poll" ? [{ label: "See who voted", icon: BarChart3, onClick: () => openVoters(actionMsg) }] : []),
                ...(isAdmin && isOwn(actionMsg) ? [{ label: "Seen by", icon: Eye, onClick: () => openSeen(actionMsg) }] : []),
                ...(isAdmin ? [{ label: "Delete", icon: Trash2, danger: true, onClick: () => delMsg(actionMsg.id) }] : []),
              ]}
              onClose={() => setActionMsg(null)}
            />
          )}
        </>
      )}
    </div>
  );
};
