// MessagesPage — team chat: conversation list → conversation view, with
// team channels (chatGroups), DMs, and scheduled sends. Premium chat
// aesthetic: bubbles, day dividers, Lucide icons only (message TEXT may of
// course contain user emoji).
//
// Data comes from ./hooks (useChat owns every read/write). Messages are
// PAGINATED: the feed listens to a realtime window of the newest 150 per
// channel, with "Load earlier messages" widening the window — no
// full-history listener.
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Bell,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Clock,
  Hash,
  Layers,
  Link2,
  MessageCircle,
  Pin,
  Plus,
  Send,
  X,
} from "lucide-react";
import { useConfirm } from "../../components/ui/ConfirmDialog";
import Btn from "../../components/ui/Btn";
import Avatar from "../../components/ui/Avatar";
import EmptyState from "../../components/ui/EmptyState";
import { toast } from "../../lib/toast";
import { formatDayKey, formatDateHeader, formatTime } from "../../lib/dates";
import { TEAM_CHANNEL, useChat, useChannelMessages, useChannelMeta } from "./hooks";
import Linkify, { URL_RE } from "./components/Linkify";
import MessageRow, { AttIcon } from "./components/MessageRow";
import ChannelModal from "./components/ChannelModal";
import ScheduledModal from "./components/ScheduledModal";
import ViewersModal from "./components/ViewersModal";

const msOf = (ts) => (ts?.toMillis ? ts.toMillis() : ts?.seconds ? ts.seconds * 1000 : 0);

// A day separator in a chat feed — thin lines flanking the date label.
const DateDivider = ({ label }) => (
  <div className="flex items-center gap-3 my-1.5">
    <div className="flex-1 h-px bg-[var(--th-surface-2)]" />
    <span className="text-[11px] font-bold uppercase tracking-wider text-ink-faint flex-shrink-0">
      {label}
    </span>
    <div className="flex-1 h-px bg-[var(--th-surface-2)]" />
  </div>
);

const previewText = (m) =>
  m.kind === "poll"
    ? `Poll: ${m.question || "Poll"}`
    : m.attachment?.type === "image"
      ? "Photo"
      : m.text || "";

// Poll composer options carry stable ids so adding/removing an option never
// shifts input focus or text (no index keys).
let pollOptSeq = 0;
const newPollOpt = (text = "") => ({ id: `popt-${++pollOptSeq}`, text });

export default function MessagesPage({ user }) {
  const confirm = useConfirm();
  const chat = useChat(user);
  const {
    isAdmin,
    chatGroups,
    visibleChannels,
    groupsList,
    announcements,
    dms,
    dmThreads,
    scheduled,
    invites,
    rosterCount,
    nameByUid,
    nameByEmail,
    rosterPlayers,
    addMessage,
    togglePinMessage,
    deleteMessage,
    markMessagesRead,
    voteOnPoll,
    reactToMessage,
    addChatGroup,
    deleteChatGroup,
    updateChatGroup,
    pinChatGroup,
    addScheduled,
    deleteScheduled,
    addDM,
    addAnnouncement,
    deleteAnnouncement,
    sendImage,
  } = chat;

  const [activeChannel, setActiveChannel] = useState(null);
  const [shared, setShared] = useState(false);
  const [input, setInput] = useState("");
  const [showPinned, setShowPinned] = useState(true);
  const [pinOnSend, setPinOnSend] = useState(false);
  const [announceMode, setAnnounceMode] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  const [pollOpen, setPollOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState({ question: "", options: [newPollOpt(), newPollOpt()] });
  const [uploading, setUploading] = useState(false);
  const [channelModal, setChannelModal] = useState(false);
  const [scheduledModal, setScheduledModal] = useState(false);
  const [viewer, setViewer] = useState(null); // { title, groups } — seen/voted breakdown
  const [copiedId, setCopiedId] = useState(null);

  const photoInputRef = useRef(null);
  const feedRef = useRef(null);
  const earlierScrollRef = useRef(null);
  const readMarkedRef = useRef(new Set());

  // ── Conversations ─────────────────────────────────────────────
  const channels = useMemo(
    () => [
      { id: TEAM_CHANNEL, name: "Team", channel: true },
      ...visibleChannels.map((c) => ({ id: c.id, name: c.name, pinned: !!c.pinned, channel: true })),
      ...dmThreads,
    ],
    [visibleChannels, dmThreads],
  );
  const validIds = useMemo(() => new Set(channels.map((c) => c.id)), [channels]);
  const activeConv = activeChannel && validIds.has(activeChannel) ? activeChannel : null;
  const activeName = (channels.find((c) => c.id === activeConv) || {}).name || "Chat";
  const effectiveChannel = activeConv || TEAM_CHANNEL;
  const isDM = effectiveChannel === "coach-dm" || effectiveChannel.startsWith("dm:");
  const dmThreadId = !isDM ? null : effectiveChannel === "coach-dm" ? user.uid : effectiveChannel.slice(3);

  // Paginated channel feed (realtime window, newest PAGE_SIZE).
  const {
    messages: channelMessages,
    hasMore,
    loadEarlier,
  } = useChannelMessages(user, isDM || !activeConv ? null : effectiveChannel);

  // Cheap latest-message metadata for the conversation list (limit(1) per
  // channel — no full-history scan). Drives the preview line, timestamp, and
  // the "new activity" indicator.
  const channelIds = useMemo(() => channels.filter((c) => c.channel).map((c) => c.id), [channels]);
  const channelMeta = useChannelMeta(user, activeConv ? [] : channelIds);

  const dmMessages = useMemo(() => {
    if (!isDM) return [];
    return (dms || []).filter((d) => d.threadId === dmThreadId).sort((a, b) => msOf(a.createdAt) - msOf(b.createdAt));
  }, [dms, isDM, dmThreadId]);

  const convList = useMemo(() => {
    const withMeta = channels.map((c) => {
      if (c.dm) {
        const thread = (dms || []).filter((d) =>
          isAdmin ? `dm:${d.threadId}` === c.id : c.id === "coach-dm",
        );
        const last = thread.reduce((best, d) => (!best || msOf(d.createdAt) >= msOf(best.createdAt) ? d : best), null);
        return {
          ...c,
          lastTs: last ? msOf(last.createdAt) : 0,
          lastAt: last?.createdAt || null,
          lastText: last ? last.text || "" : "",
          lastSender: last ? last.senderName || "" : "",
          hasNew: !!last && last.senderUid !== user.uid && !last.readBy?.[user.uid],
        };
      }
      const m = channelMeta[c.id];
      return {
        ...c,
        lastTs: m ? msOf(m.createdAt) : 0,
        lastAt: m?.createdAt || null,
        lastText: m ? previewText(m) : "",
        lastSender: m ? m.sender || "" : "",
        hasNew: !!m && m.senderUid !== user.uid && !m.readBy?.[user.uid],
      };
    });
    return withMeta.sort((a, b) => {
      if (a.id === TEAM_CHANNEL) return -1;
      if (b.id === TEAM_CHANNEL) return 1;
      if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
      return (b.lastTs || 0) - (a.lastTs || 0);
    });
  }, [channels, channelMeta, dms, isAdmin, user.uid]);

  // ── Message stream (channel view) with day dividers ────────────
  const stream = useMemo(() => {
    // In the Team channel, announcements appear inline as broadcast cards,
    // interleaved with messages by time — one place for team-wide comms.
    const items = channelMessages.map((m) => ({ ts: m.createdAt, kind: "msg", message: m }));
    if (effectiveChannel === TEAM_CHANNEL) {
      (announcements || []).forEach((a) => items.push({ ts: a.createdAt, kind: "announcement", announcement: a }));
    }
    items.sort((a, b) => msOf(a.ts) - msOf(b.ts));
    const out = [];
    let lastDay = null;
    items.forEach((it) => {
      const day = formatDayKey(it.ts);
      if (day && day !== lastDay) {
        out.push({ kind: "divider", id: `div-${day}`, label: formatDateHeader(it.ts) });
        lastDay = day;
      }
      out.push(
        it.kind === "announcement"
          ? { kind: "announcement", id: `a-${it.announcement.id}`, announcement: it.announcement }
          : { kind: "msg", id: it.message.id, message: it.message },
      );
    });
    return out;
  }, [channelMessages, announcements, effectiveChannel]);

  const dmStream = useMemo(() => {
    const out = [];
    let lastDay = null;
    (dmMessages || []).forEach((d) => {
      const day = formatDayKey(d.createdAt);
      if (day && day !== lastDay) {
        out.push({ kind: "divider", id: `dmdiv-${day}`, label: formatDateHeader(d.createdAt) });
        lastDay = day;
      }
      out.push({ kind: "dm", id: d.id, dm: d });
    });
    return out;
  }, [dmMessages]);

  // ── Scroll behavior ───────────────────────────────────────────
  // Stick to the bottom when new messages arrive; preserve position when
  // "Load earlier" prepends history.
  useEffect(() => {
    const el = feedRef.current;
    if (!el) return;
    if (earlierScrollRef.current != null) {
      el.scrollTop += el.scrollHeight - earlierScrollRef.current;
      earlierScrollRef.current = null;
      return;
    }
    if (shared || !activeConv) return;
    const toBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    toBottom();
    const r1 = requestAnimationFrame(() => {
      toBottom();
      requestAnimationFrame(toBottom);
    });
    const t = setTimeout(toBottom, 120);
    return () => {
      cancelAnimationFrame(r1);
      clearTimeout(t);
    };
  }, [channelMessages, dmMessages, shared, activeConv]);

  const handleLoadEarlier = () => {
    if (feedRef.current) earlierScrollRef.current = feedRef.current.scrollHeight;
    loadEarlier();
  };

  // ── Read receipts ─────────────────────────────────────────────
  // Mark every loaded message (that isn't ours and we haven't read) as read.
  // Optimistic via readMarkedRef, rolled back if the batch fails.
  useEffect(() => {
    if (shared || !activeConv || isDM) return;
    const toMark = channelMessages
      .filter((m) => m.senderUid !== user.uid)
      .filter((m) => !m.readBy?.[user.uid])
      .filter((m) => !readMarkedRef.current.has(`${effectiveChannel}:${m.id}`))
      .map((m) => m.id);
    if (!toMark.length) return;
    toMark.forEach((id) => readMarkedRef.current.add(`${effectiveChannel}:${id}`));
    markMessagesRead(toMark).catch(() => {
      toMark.forEach((id) => readMarkedRef.current.delete(`${effectiveChannel}:${id}`));
    });
  }, [channelMessages, shared, activeConv, isDM, effectiveChannel, user.uid, markMessagesRead]);

  // ── Actions ───────────────────────────────────────────────────
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
        await addMessage(text, {
          pinned: isAdmin && pinOnSend,
          replyTo: wasReply,
          channel: effectiveChannel,
        });
        if (pinOnSend) setPinOnSend(false);
      }
    } catch (e) {
      toast("Couldn't send — " + (e.message || "check Firestore rules."));
      setInput(text);
      setReplyTo(wasReply);
    }
  };

  const sendPoll = async () => {
    const opts = pollDraft.options.map((o) => o.text.trim()).filter(Boolean);
    if (!pollDraft.question.trim() || opts.length < 2) return;
    try {
      await addMessage("", {
        poll: { question: pollDraft.question.trim(), options: opts },
        channel: effectiveChannel,
      });
      setPollDraft({ question: "", options: [newPollOpt(), newPollOpt()] });
      setPollOpen(false);
    } catch (e) {
      toast("Couldn't create poll — " + (e.message || ""));
    }
  };

  const onSendImage = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      await sendImage(file, effectiveChannel);
    } catch (e) {
      toast("Couldn't send photo — " + (e.message || "check Storage rules?"));
    } finally {
      setUploading(false);
    }
  };

  const togglePin = (m) => togglePinMessage(m.id, m.pinned).catch((e) => toast("Couldn't pin — " + (e.message || "")));

  const delMsg = async (id) => {
    const ok = await confirm({
      title: "Delete this message?",
      body: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    deleteMessage(id).catch((e) => toast("Couldn't delete — " + (e.message || "")));
  };

  const delAnnouncement = async (id) => {
    const ok = await confirm({
      title: "Delete this announcement?",
      body: "This can't be undone.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (!ok) return;
    deleteAnnouncement(id).catch(() => {});
  };

  const startReply = (m) =>
    setReplyTo({ id: m.id, sender: m.sender, text: m.text, kind: m.kind, question: m.question });
  const cancelReply = () => setReplyTo(null);

  const copyMsg = async (m) => {
    const text = m.kind === "poll" ? m.question : m.text;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId((c) => (c === m.id ? null : c)), 1500);
    } catch {
      /* clipboard unavailable — text is still selectable manually */
    }
  };

  // Coach-only: who's seen a message / who voted for each poll option.
  const openSeen = (m) => {
    const seenUids = Object.keys(m.readBy || {}).filter((uid) => uid !== m.senderUid);
    const seenSet = new Set(seenUids);
    const seenNames = seenUids.map((uid) => nameByUid[uid] || "Member").sort();
    const notSeen = rosterPlayers
      .filter((pp) => pp.id !== m.senderUid && !seenSet.has(pp.id))
      .map((pp) => pp.name || pp.email)
      .sort();
    setViewer({
      title: "Seen by",
      groups: [
        { label: `Seen · ${seenNames.length}`, names: seenNames },
        { label: `Not yet · ${notSeen.length}`, names: notSeen },
      ],
    });
  };
  const openVoters = (m) => {
    const votes = m.votes || {};
    const voterSet = new Set(Object.keys(votes));
    const grps = (m.options || []).map((opt, i) => ({
      label: `${opt} · ${Object.values(votes).filter((v) => v === i).length}`,
      names: Object.entries(votes)
        .filter(([, v]) => v === i)
        .map(([uid]) => nameByUid[uid] || "Member")
        .sort(),
    }));
    const nonVoters = rosterPlayers
      .filter((pp) => !voterSet.has(pp.id))
      .map((pp) => pp.name || pp.email)
      .sort();
    grps.push({ label: `Didn't vote · ${nonVoters.length}`, names: nonVoters });
    setViewer({ title: m.question || "Poll results", groups: grps });
  };

  const pinnedMsgs = channelMessages.filter((m) => m.pinned);
  const mediaMsgs = channelMessages.filter((m) => m.attachment);
  const linkMsgs = channelMessages.filter((m) => URL_RE.test(m.text || ""));

  const openConversation = (id) => {
    setActiveChannel(id);
    setShared(false);
    setAnnounceMode(false);
    setReplyTo(null);
    setPollOpen(false);
  };

  // ── Conversation list ─────────────────────────────────────────
  if (!activeConv) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <div className="px-5 py-3 border-b border-[var(--th-surface-2)] bg-white flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-[22px] uppercase tracking-wide text-ink leading-none">
              Messages
            </h3>
            <p className="text-[11px] text-ink-faint mt-0.5">{rosterCount} on roster</p>
          </div>
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Btn size="sm" variant="ghost" icon={Clock} onClick={() => setScheduledModal(true)}>
                Scheduled
              </Btn>
              <Btn size="sm" icon={Plus} onClick={() => setChannelModal(true)}>
                Group
              </Btn>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 bg-[var(--th-bg)]">
          {convList.length === 0 ? (
            <EmptyState
              icon={MessageCircle}
              title="No conversations"
              body="Your team channel will appear here once messaging is set up."
            />
          ) : (
            <ul className="divide-y divide-[var(--th-surface-2)]">
              {convList.map((c) => {
                const preview = c.lastText
                  ? `${!c.dm && c.lastSender ? c.lastSender.split(" ")[0] + ": " : ""}${c.lastText}`
                  : "No messages yet";
                return (
                  <li key={c.id} className="flex items-center bg-white hover:bg-[var(--th-surface-2)]">
                    <button
                      onClick={() => openConversation(c.id)}
                      className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left"
                    >
                      {c.dm ? (
                        <Avatar initials={(c.name || "?")[0]?.toUpperCase()} size={40} />
                      ) : (
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 text-white bg-brand-primary">
                          <Hash className="w-4 h-4" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          {(c.id === TEAM_CHANNEL || c.pinned) && (
                            <Pin
                              className={`w-3 h-3 flex-shrink-0 ${c.id === TEAM_CHANNEL ? "text-brand-accent" : "text-ink-faint"}`}
                            />
                          )}
                          <span className="text-sm font-bold text-ink truncate">{c.name}</span>
                          {c.hasNew && (
                            <span className="w-2.5 h-2.5 rounded-full bg-brand-accent flex-shrink-0" aria-label="New messages" />
                          )}
                        </div>
                        <div className="text-xs text-ink-soft truncate mt-0.5">{preview}</div>
                      </div>
                      {c.lastAt && (
                        <span className="text-[11px] text-ink-faint flex-shrink-0 self-start">
                          {formatTime(c.lastAt)}
                        </span>
                      )}
                    </button>
                    {isAdmin && c.channel && c.id !== TEAM_CHANNEL && (
                      <button
                        onClick={() => pinChatGroup(c.id, !c.pinned)}
                        title={c.pinned ? "Unpin" : "Pin to top"}
                        className={`px-3 py-3 flex-shrink-0 ${c.pinned ? "text-brand-accent" : "text-ink-faint"} hover:text-brand-accent`}
                      >
                        <Pin className="w-4 h-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        {channelModal && (
          <ChannelModal
            chatGroups={chatGroups}
            groups={groupsList}
            roster={invites}
            nameByEmail={nameByEmail}
            onCreate={addChatGroup}
            onDelete={deleteChatGroup}
            onUpdate={updateChatGroup}
            onClose={() => setChannelModal(false)}
          />
        )}
        {scheduledModal && (
          <ScheduledModal
            scheduled={scheduled}
            onAdd={addScheduled}
            onDelete={deleteScheduled}
            chatGroups={chatGroups}
            groups={groupsList}
            roster={invites}
            nameByEmail={nameByEmail}
            onClose={() => setScheduledModal(false)}
          />
        )}
      </div>
    );
  }

  // ── Conversation view ─────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="px-5 py-3 border-b border-[var(--th-surface-2)] bg-white flex items-center justify-between gap-2">
        <button
          onClick={() => {
            setActiveChannel(null);
            setShared(false);
          }}
          className="flex items-center gap-2 min-w-0"
        >
          <ChevronLeft className="w-5 h-5 text-ink-faint flex-shrink-0" />
          <div className="min-w-0 text-left">
            <h3 className="font-display font-bold text-[20px] uppercase tracking-wide text-ink truncate leading-none">
              {activeName}
            </h3>
            <p className="text-[11px] text-ink-faint mt-0.5">{rosterCount} on roster</p>
          </div>
        </button>
        {!isDM && (
          <button
            onClick={() => setShared(!shared)}
            className={`text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full flex items-center gap-1.5 flex-shrink-0 ${
              shared ? "bg-brand-primary text-white" : "bg-[var(--th-surface-2)] text-ink-soft"
            }`}
          >
            <Layers className="w-3 h-3" /> {shared ? "Chat" : "Shared"}
          </button>
        )}
      </div>

      {channelModal && (
        <ChannelModal
          chatGroups={chatGroups}
          groups={groupsList}
          roster={invites}
          nameByEmail={nameByEmail}
          onCreate={addChatGroup}
          onDelete={deleteChatGroup}
          onUpdate={updateChatGroup}
          onClose={() => setChannelModal(false)}
        />
      )}
      {viewer && <ViewersModal title={viewer.title} groups={viewer.groups} onClose={() => setViewer(null)} />}

      {shared ? (
        <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4 space-y-5 bg-[var(--th-bg)]">
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
              Photos & Files
            </h4>
            {mediaMsgs.length === 0 ? (
              <p className="text-xs text-ink-faint italic">No files shared yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {mediaMsgs.map((m) =>
                  m.attachment?.type === "image" && m.attachment.url ? (
                    <a
                      key={m.id}
                      href={m.attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="aspect-square rounded-xl overflow-hidden bg-[var(--th-surface-2)] block"
                    >
                      <img
                        src={m.attachment.url}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <div
                      key={m.id}
                      className="bg-white rounded-xl border border-[var(--th-surface-2)] p-3 flex flex-col items-center text-center"
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center mb-1.5 bg-brand-accent-soft text-brand-accent">
                        <AttIcon type={m.attachment.type} />
                      </div>
                      <div className="text-[11px] font-semibold text-ink truncate w-full">
                        {m.attachment.name}
                      </div>
                      <div className="text-[11px] text-ink-faint">{m.sender.split(" ")[0]}</div>
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">Links</h4>
            {linkMsgs.length === 0 ? (
              <p className="text-xs text-ink-faint italic">No links shared yet.</p>
            ) : (
              <ul className="space-y-2">
                {linkMsgs.map((m) => {
                  const url = (m.text.match(URL_RE) || [])[0];
                  return (
                    <li
                      key={m.id}
                      className="bg-white rounded-xl border border-[var(--th-surface-2)] p-3 flex items-center gap-2.5"
                    >
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[var(--th-info)]"
                        style={{ backgroundColor: "color-mix(in srgb, var(--th-info) 15%, transparent)" }}
                      >
                        <Link2 className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-semibold text-ink truncate block underline underline-offset-2"
                        >
                          {url}
                        </a>
                        <div className="text-[11px] text-ink-faint">
                          shared by {m.sender.split(" ")[0]}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : isDM ? (
        <>
          <div ref={feedRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-3 bg-[var(--th-bg)]">
            {dmMessages.length === 0 && (
              <p className="text-center text-xs text-ink-faint italic py-6">
                {isAdmin
                  ? "No messages in this thread yet."
                  : "Message your coach privately. Only you and the coaches can see this."}
              </p>
            )}
            {dmStream.map((item) => {
              if (item.kind === "divider") return <DateDivider key={item.id} label={item.label} />;
              const d = item.dm;
              const own = d.senderUid === user.uid;
              return (
                <div key={d.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-xl px-3 py-2 text-sm shadow-card ${
                      own ? "bg-brand-primary text-white" : "bg-white text-ink"
                    }`}
                  >
                    {!own && (
                      <div className="text-[11px] font-bold mb-0.5 text-brand-accent">
                        {d.senderName}
                        {d.isCoach ? " · Coach" : ""}
                      </div>
                    )}
                    <p className="leading-snug break-words select-text">
                      <Linkify>{d.text}</Linkify>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="bg-white border-t border-[var(--th-surface-2)] p-3 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={isAdmin ? "Reply…" : "Message your coach…"}
              className="flex-1 bg-[var(--th-surface-2)] rounded-full px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--th-accent)]"
            />
            <button
              onClick={send}
              disabled={!input.trim()}
              aria-label="Send"
              className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40 bg-brand-primary"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </>
      ) : (
        <>
          {pinnedMsgs.length > 0 && (
            <div className="bg-brand-accent-soft border-b border-brand-accent">
              <button
                onClick={() => setShowPinned(!showPinned)}
                className="w-full px-4 py-2 flex items-center justify-between"
              >
                <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-brand-accent">
                  <Pin className="w-3 h-3" /> {pinnedMsgs.length} Pinned
                </span>
                {showPinned ? (
                  <ChevronUp className="w-3.5 h-3.5 text-brand-accent" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-brand-accent" />
                )}
              </button>
              {showPinned && (
                <ul className="px-4 pb-2 space-y-1">
                  {pinnedMsgs.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-ink">{m.sender.split(" ")[0]}:</span>
                      <span className="text-ink-soft truncate flex-1">{m.text}</span>
                      {isAdmin && (
                        <button onClick={() => togglePin(m)} className="text-brand-accent" aria-label="Unpin">
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div ref={feedRef} className="flex-1 overflow-y-auto min-h-0 px-4 py-4 space-y-3 bg-[var(--th-bg)]">
            {hasMore && (
              <div className="flex justify-center pb-1">
                <button
                  onClick={handleLoadEarlier}
                  className="text-[11px] font-bold uppercase tracking-wider px-4 py-1.5 rounded-full bg-white border border-[var(--th-surface-2)] text-ink-soft shadow-card hover:text-ink"
                >
                  Load earlier messages
                </button>
              </div>
            )}
            {stream.length === 0 && (
              <EmptyState
                icon={MessageCircle}
                title="No messages yet"
                body="Be the first to say something to the team."
              />
            )}
            {stream.map((item) => {
              if (item.kind === "divider") return <DateDivider key={item.id} label={item.label} />;
              if (item.kind === "announcement") {
                const a = item.announcement;
                return (
                  <div
                    key={item.id}
                    className="rounded-xl p-3.5 shadow-card border bg-brand-accent-soft border-brand-accent"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 text-brand-accent">
                        <Bell className="w-3 h-3" /> Announcement
                      </span>
                      {isAdmin && (
                        <button
                          onClick={() => delAnnouncement(a.id)}
                          className="text-ink-faint hover:text-[var(--th-danger)]"
                          aria-label="Delete announcement"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="text-sm font-bold text-ink mt-1">{a.title}</div>
                    {a.body && <div className="text-xs text-ink-soft mt-0.5 leading-snug">{a.body}</div>}
                  </div>
                );
              }
              const m = item.message;
              const own = isOwn(m);
              return (
                <MessageRow
                  key={m.id}
                  message={m}
                  own={own}
                  user={user}
                  isAdmin={isAdmin}
                  seenCount={own ? readByCount(m) : 0}
                  onOpenSeen={openSeen}
                  onReply={startReply}
                  onCopy={copyMsg}
                  copied={copiedId === m.id}
                  onTogglePin={togglePin}
                  onDelete={delMsg}
                  onVote={voteOnPoll}
                  onReact={reactToMessage}
                  onSeeVoters={openVoters}
                />
              );
            })}
          </div>

          {pollOpen && (
            <div className="bg-white border-t border-[var(--th-surface-2)] px-4 py-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
                  <BarChart3 className="w-3 h-3" /> Create poll
                </span>
                <button
                  onClick={() => {
                    setPollOpen(false);
                    setPollDraft({ question: "", options: [newPollOpt(), newPollOpt()] });
                  }}
                  className="text-ink-faint hover:text-ink"
                  aria-label="Close poll composer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <input
                value={pollDraft.question}
                onChange={(e) => setPollDraft({ ...pollDraft, question: e.target.value })}
                placeholder="Ask the team a question…"
                className="w-full border border-[var(--th-surface-2)] rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--th-accent)]"
              />
              {pollDraft.options.map((opt) => (
                <div key={opt.id} className="flex gap-2">
                  <input
                    value={opt.text}
                    onChange={(e) => {
                      const options = pollDraft.options.map((o) =>
                        o.id === opt.id ? { ...o, text: e.target.value } : o,
                      );
                      setPollDraft({ ...pollDraft, options });
                    }}
                    placeholder={`Option ${pollDraft.options.indexOf(opt) + 1}`}
                    className="flex-1 border border-[var(--th-surface-2)] rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--th-accent)]"
                  />
                  {pollDraft.options.length > 2 && (
                    <button
                      onClick={() =>
                        setPollDraft({
                          ...pollDraft,
                          options: pollDraft.options.filter((o) => o.id !== opt.id),
                        })
                      }
                      className="text-ink-faint hover:text-[var(--th-danger)]"
                      aria-label="Remove option"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex gap-2">
                {pollDraft.options.length < 4 && (
                  <button
                    onClick={() =>
                      setPollDraft({ ...pollDraft, options: [...pollDraft.options, newPollOpt()] })
                    }
                    className="flex-1 py-2 rounded-full bg-[var(--th-surface-2)] text-xs font-bold text-ink-soft"
                  >
                    + Option
                  </button>
                )}
                <Btn
                  className="flex-1"
                  size="sm"
                  disabled={
                    !pollDraft.question.trim() || pollDraft.options.filter((o) => o.text.trim()).length < 2
                  }
                  onClick={sendPoll}
                >
                  Send poll
                </Btn>
              </div>
            </div>
          )}

          <div className="bg-white border-t border-[var(--th-surface-2)]">
            {replyTo && (
              <div className="px-4 py-2 flex items-center gap-2 border-b border-[var(--th-surface-2)] bg-brand-accent-soft">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-bold text-ink">Replying to {replyTo.sender}</div>
                  <div className="text-[11px] text-ink-soft truncate">
                    {replyTo.kind === "poll" ? `Poll: ${replyTo.question}` : replyTo.text}
                  </div>
                </div>
                <button onClick={cancelReply} className="text-ink-faint hover:text-ink" aria-label="Cancel reply">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {isAdmin && pinOnSend && (
              <div className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 bg-brand-accent-soft text-brand-accent">
                <Pin className="w-3 h-3" /> Next message will be pinned
              </div>
            )}
            {isAdmin && announceMode && (
              <div className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 bg-brand-accent-soft text-brand-accent">
                <Bell className="w-3 h-3" /> Posting as an announcement to the whole team
              </div>
            )}
            <div className="p-3 flex items-center gap-2">
              <button
                onClick={() => photoInputRef.current?.click()}
                disabled={uploading}
                aria-label="Send photo"
                title="Send a photo"
                className="w-9 h-9 rounded-full flex items-center justify-center text-ink-faint hover:bg-[var(--th-surface-2)] disabled:opacity-40 disabled:cursor-wait"
              >
                {uploading ? (
                  <span className="inline-block w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onSendImage(f);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => setPollOpen(!pollOpen)}
                aria-label="Create poll"
                title="Create poll"
                className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                  pollOpen ? "bg-brand-accent-soft text-brand-accent" : "text-ink-soft"
                }`}
              >
                <BarChart3 className="w-4 h-4" />
              </button>
              {isAdmin && (
                <button
                  onClick={() => setPinOnSend(!pinOnSend)}
                  aria-label="Pin on send"
                  title="Pin this message when sent"
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                    pinOnSend ? "bg-brand-accent-soft text-brand-accent" : "text-ink-soft"
                  }`}
                >
                  <Pin className="w-4 h-4" />
                </button>
              )}
              {isAdmin && effectiveChannel === TEAM_CHANNEL && (
                <button
                  onClick={() => setAnnounceMode(!announceMode)}
                  aria-label="Announce"
                  title="Post as an announcement"
                  className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                    announceMode ? "bg-brand-accent-soft text-brand-accent" : "text-ink-soft"
                  }`}
                >
                  <Bell className="w-4 h-4" />
                </button>
              )}
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={replyTo ? `Reply to ${replyTo.sender}…` : "Message the team…"}
                className="flex-1 bg-[var(--th-surface-2)] rounded-full px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[var(--th-accent)]"
              />
              <button
                onClick={send}
                disabled={!input.trim()}
                aria-label="Send"
                className="w-9 h-9 rounded-full flex items-center justify-center text-white disabled:opacity-40 bg-brand-primary"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
