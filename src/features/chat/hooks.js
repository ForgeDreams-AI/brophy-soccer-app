// Chat data hooks — every Firestore read/write the chat feature makes lives
// here (contract rule 5). Pages and components call these; they never touch
// Firestore or Storage directly.
//
// Reads:
//   - channels (chatGroups) + DMs + scheduled + announcements + groups/users
//   - messages: PAGINATED per channel — a realtime window of the newest 150
//     (limitToLast semantics via desc+limit), widened by "Load earlier".
//   - conversation list metadata: one cheap limit(1) listener per channel.
// Writes stamp audienceKeys via lib/audience on every doc that carries
// visibleTo (contract rule 9); messages inherit their channel's keys.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import { db, storage } from "../../firebase";
import { COL } from "../../data/collections";
import { useAudienceCollection, useCollection } from "../../data/hooks";
import { audienceKeysFor, withAudienceKeys } from "../../lib/audience";
import { downscaleChatImage } from "../../lib/images";
import { toast } from "../../lib/toast";

// The always-present team-wide channel id. Defined once — every reference in
// this feature goes through this constant (was hard-coded in 5+ places).
export const TEAM_CHANNEL = "team";

const PAGE_SIZE = 150;
const WRITE_CHUNK = 400;

// Per-channel message query, newest-first. Players are audience-filtered
// server-side (security rules enforce audienceKeys); coaches read the whole
// channel. NOTE: requires composite indexes on `messages`:
//   coaches: (channel ASC, createdAt DESC)
//   players: (channel ASC, audienceKeys ARRAY, createdAt DESC)
// Firestore surfaces a one-click "create index" link in the error if missing.
function channelQuery({ uid, role, email }, channelId, n) {
  const parts = [where("channel", "==", channelId)];
  if (role !== "admin") {
    const keys = ["*", "uid:" + uid];
    if (email) keys.push("email:" + email);
    parts.push(where("audienceKeys", "array-contains-any", keys));
  }
  return query(collection(db, COL.messages), ...parts, orderBy("createdAt", "desc"), limit(n));
}

// Paginated realtime messages for one channel. Returns rows oldest→newest for
// rendering. `loadEarlier` widens the window by another page; `hasMore` is
// true while the window came back full (there may be older messages).
export function useChannelMessages(user, channelId) {
  const [size, setSize] = useState(PAGE_SIZE);
  const [rows, setRows] = useState([]);
  // Destructured up front so the subscription effect below can depend on
  // exactly the values it reads — the linter can't see through `user.uid`.
  const uid = user?.uid;
  const role = user?.role;
  const email = user?.email;

  // Fresh window whenever the channel changes — render-synced with a
  // previous-value guard instead of an effect.
  const [prevChannelId, setPrevChannelId] = useState(channelId);
  if (channelId !== prevChannelId) {
    setPrevChannelId(channelId);
    setSize(PAGE_SIZE);
    setRows([]);
  }

  // Clear rows as soon as the query becomes inactive — derived during
  // render with a previous-value guard. The subscription below only runs
  // while active.
  const [chanWasActive, setChanWasActive] = useState(!!(uid && channelId));
  const chanActive = !!(uid && channelId);
  if (chanActive !== chanWasActive) {
    setChanWasActive(chanActive);
    if (!chanActive) setRows([]);
  }

  useEffect(() => {
    if (!uid || !channelId) return;
    return onSnapshot(
      channelQuery({ uid, role, email }, channelId, size),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        docs.reverse(); // desc → asc for the feed
        setRows(docs);
      },
      (err) => {
        toast("Couldn't load messages — " + (err.message || "check Firestore indexes."));
      },
    );
  }, [uid, role, email, channelId, size]);

  const loadEarlier = useCallback(() => setSize((s) => s + PAGE_SIZE), []);
  const hasMore = rows.length >= size;
  return { messages: rows, hasMore, loadEarlier };
}

// Latest-message metadata for the conversation list. One cheap limit(1)
// listener per channel id — no full-history scan. The newest message also
// drives the "new activity" indicator (it is unread by me ⇔ something new).
export function useChannelMeta(user, channelIds) {
  const [meta, setMeta] = useState({});
  const key = (channelIds || []).join("|");
  // Destructured up front so the effect below can depend on exactly the
  // values it reads — the linter can't see through `user.uid`-style access.
  const uid = user?.uid;
  const role = user?.role;
  const email = user?.email;

  // Clear stale metadata as soon as the query becomes inactive —
  // derived during render with a previous-value guard. The subscriptions
  // below only run while active.
  const [metaWasActive, setMetaWasActive] = useState(null);
  const metaActive = !!(uid && channelIds?.length);
  if (metaActive !== metaWasActive) {
    setMetaWasActive(metaActive);
    if (!metaActive) setMeta({});
  }

  useEffect(() => {
    if (!uid || !channelIds?.length) return;
    const unsubs = channelIds.map((cid) => {
      const parts = [where("channel", "==", cid)];
      if (role !== "admin") {
        const keys = ["*", "uid:" + uid];
        if (email) keys.push("email:" + email);
        parts.push(where("audienceKeys", "array-contains-any", keys));
      }
      const q = query(collection(db, COL.messages), ...parts, orderBy("createdAt", "desc"), limit(1));
      return onSnapshot(
        q,
        (snap) => {
          const d = snap.docs[0];
          setMeta((prev) => ({ ...prev, [cid]: d ? { id: d.id, ...d.data() } : null }));
        },
        () => {},
      );
    });
    return () => unsubs.forEach((u) => u());
    // `key` intentionally stands in for the channelIds array: resubscribing
    // must depend on the joined contents, not the array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, uid, role, email]);

  return meta;
}

// The whole chat domain for one user: reads, derived lists, and every write.
export function useChat(user) {
  const isAdmin = user?.role === "admin";
  const uid = user?.uid;
  // Destructured once so the callbacks below can depend on exactly the
  // fields they read. (Bodies read `user.name` directly, which the compiler
  // infers as the whole `user` object — narrower `user?.name` deps would
  // then fail to preserve manual memoization.)
  const userName = user?.name;
  const userInitials = user?.initials;

  const chatGroups = useAudienceCollection(user ? COL.chatGroups : null, user, "createdAt");
  const groupsList = useCollection(user ? COL.groups : null, orderBy("name"));
  const announcements = useCollection(user ? COL.announcements : null, orderBy("createdAt", "desc"));
  const dms = useCollection(
    user ? COL.dms : null,
    ...(isAdmin ? [] : [where("threadId", "==", uid || "_")]),
  );
  const scheduled = useCollection(isAdmin ? COL.scheduled : null, orderBy("sendAt"));
  // Admin-only (rules deny otherwise): roster data for pickers + name lookups.
  const allUsers = useCollection(isAdmin ? COL.users : null, orderBy("name"));
  const invites = useCollection(isAdmin ? COL.invites : null, orderBy("email"));

  const nameByUid = useMemo(
    () => Object.fromEntries((allUsers || []).map((u) => [u.id, u.name || u.email || "Member"])),
    [allUsers],
  );
  const nameByEmail = useMemo(
    () =>
      Object.fromEntries(
        (allUsers || []).filter((u) => u.email && u.name).map((u) => [u.email.toLowerCase(), u.name]),
      ),
    [allUsers],
  );
  const rosterPlayers = useMemo(() => (allUsers || []).filter((u) => u.role !== "admin"), [allUsers]);

  // Group ids this user belongs to (uid or email membership) — drives the
  // client-side channel visibility filter below.
  const myGroupIds = useMemo(
    () =>
      new Set(
        (groupsList || [])
          .filter(
            (g) =>
              (g.memberUids || []).includes(uid) || (g.memberUids || []).includes(user?.email),
          )
          .map((g) => g.id),
      ),
    [groupsList, uid, user?.email],
  );

  // Which group chats this user may see. Coaches bypass; empty visibleTo =
  // everyone. Mirrors the server-side audienceKeys filter for the list UI.
  const visibleChannels = useMemo(
    () =>
      (chatGroups || []).filter((c) => {
        if (isAdmin) return true;
        const v = c.visibleTo || {};
        const emails = v.emails || [];
        const uids = v.uids || [];
        const gids = v.groupIds || [];
        if (!emails.length && !uids.length && !gids.length) return true;
        if (uids.includes(uid) || emails.includes(user?.email)) return true;
        return gids.some((id) => myGroupIds.has(id));
      }),
    [chatGroups, isAdmin, myGroupIds, uid, user?.email],
  );

  // DM threads. Players get one "Coach" thread; coaches get one entry per
  // player thread (named by the player's own sent name).
  const dmThreads = useMemo(() => {
    if (!isAdmin) return [{ id: "coach-dm", name: "Coach", dm: true }];
    const byThread = new Map();
    (dms || []).forEach((d) => {
      if (!byThread.has(d.threadId)) byThread.set(d.threadId, d);
    });
    return [...byThread.entries()].map(([tid, d]) => ({
      id: `dm:${tid}`,
      name:
        (dms || []).find((x) => x.threadId === tid && !x.isCoach)?.senderName ||
        d.senderName ||
        "Player",
      dm: true,
    }));
  }, [dms, isAdmin]);

  // ── Message writes ──────────────────────────────────────────────
  // Message doc shape (kept EXACT): { text, sender, senderUid, initials,
  // isCoach, channel, pinned, replyToId/ReplyToSender/ReplyToText,
  // attachment{type,url,path,name}, kind, question, options[], votes{},
  // reactions{}, readBy{}, audienceKeys, createdAt }.
  const addMessage = useCallback(
    (text, { attachment, pinned, replyTo, poll, channel } = {}) => {
      const chId = channel || TEAM_CHANNEL;
      // A message inherits its channel's audience so hidden channels stay
      // private server-side; the Team channel is visible to everyone.
      const ch = chId !== TEAM_CHANNEL ? (chatGroups || []).find((c) => c.id === chId) : null;
      const data = {
        senderUid: uid,
        sender: userName,
        initials: userInitials,
        text: (text || "").trim(),
        pinned: !!pinned,
        channel: chId,
        audienceKeys: ch?.audienceKeys?.length ? ch.audienceKeys : ["*"],
        isCoach: isAdmin,
        readBy: { [uid]: serverTimestamp() },
        createdAt: serverTimestamp(),
      };
      if (attachment) data.attachment = attachment;
      if (replyTo) {
        data.replyToId = replyTo.id;
        data.replyToSender = replyTo.sender;
        const preview = replyTo.kind === "poll" ? replyTo.question || "" : replyTo.text || "";
        data.replyToText = preview.slice(0, 140);
      }
      if (poll) {
        data.kind = "poll";
        data.question = poll.question;
        data.options = poll.options;
        data.votes = {};
      }
      return addDoc(collection(db, COL.messages), data);
    },
    [uid, userName, userInitials, isAdmin, chatGroups],
  );

  const togglePinMessage = useCallback(
    (id, pinned) => updateDoc(doc(db, COL.messages, id), { pinned: !pinned }),
    [],
  );

  const deleteMessage = useCallback((id) => deleteDoc(doc(db, COL.messages, id)), []);

  // Batched read receipts (dot-path readBy.<uid>). Chunked at 500/batch —
  // the Firestore writeBatch ceiling.
  const markMessagesRead = useCallback(
    async (ids) => {
      if (!ids?.length) return;
      for (let i = 0; i < ids.length; i += 500) {
        const batch = writeBatch(db);
        ids.slice(i, i + 500).forEach((id) => {
          batch.update(doc(db, COL.messages, id), { [`readBy.${uid}`]: serverTimestamp() });
        });
        await batch.commit();
      }
    },
    [uid],
  );

  const voteOnPoll = useCallback(
    (messageId, optionIndex) =>
      updateDoc(doc(db, COL.messages, messageId), { [`votes.${uid}`]: optionIndex }),
    [uid],
  );

  // Reactions are one-at-a-time; a falsy reaction clears (toggle).
  const reactToMessage = useCallback(
    (messageId, reaction) =>
      updateDoc(doc(db, COL.messages, messageId), { [`reactions.${uid}`]: reaction || deleteField() }),
    [uid],
  );

  // ── Channel writes ──────────────────────────────────────────────
  const addChatGroup = useCallback(
    (name, visibleTo) =>
      addDoc(
        collection(db, COL.chatGroups),
        withAudienceKeys(
          {
            name: name.trim(),
            visibleTo: visibleTo || { groupIds: [], emails: [] },
            createdByName: userName,
            createdAt: serverTimestamp(),
          },
          groupsList,
        ),
      ),
    [userName, groupsList],
  );

  const deleteChatGroup = useCallback((id) => deleteDoc(doc(db, COL.chatGroups, id)), []);

  // Editing a channel re-stamps every message's audienceKeys in 400-doc
  // chunks (preserved from v1): added members gain the history, removed
  // members lose it — enforced by rules, not just hidden in the UI. Uses a
  // one-time getDocs sweep (not the paginated window) so no message is
  // missed. The channel doc is written LAST: if the sweep fails partway, the
  // channel still lists its old members and a retry re-runs the whole sweep.
  const updateChatGroup = useCallback(
    async (id, visibleTo) => {
      const audienceKeys = audienceKeysFor(visibleTo, groupsList);
      const snap = await getDocs(query(collection(db, COL.messages), where("channel", "==", id)));
      for (let i = 0; i < snap.docs.length; i += WRITE_CHUNK) {
        const batch = writeBatch(db);
        snap.docs.slice(i, i + WRITE_CHUNK).forEach((d) => batch.update(d.ref, { audienceKeys }));
        await batch.commit();
      }
      await updateDoc(doc(db, COL.chatGroups, id), withAudienceKeys({ visibleTo }, groupsList));
    },
    [groupsList],
  );

  const pinChatGroup = useCallback(
    (id, pinned) => updateDoc(doc(db, COL.chatGroups, id), { pinned: !!pinned }),
    [],
  );

  // ── Scheduled / DMs / announcements ─────────────────────────────
  const addScheduled = useCallback(
    (data) =>
      addDoc(collection(db, COL.scheduled), {
        ...data,
        sent: false,
        createdByUid: uid,
        createdByName: userName,
        createdByInitials: userInitials,
        createdAt: serverTimestamp(),
      }),
    [uid, userName, userInitials],
  );

  const deleteScheduled = useCallback((id) => deleteDoc(doc(db, COL.scheduled, id)), []);

  const addDM = useCallback(
    (text, threadId) =>
      addDoc(collection(db, COL.dms), {
        threadId,
        senderUid: uid,
        senderName: userName,
        isCoach: isAdmin,
        text: (text || "").trim(),
        createdAt: serverTimestamp(),
      }),
    [uid, userName, isAdmin],
  );

  const addAnnouncement = useCallback(
    (title, body) =>
      addDoc(collection(db, COL.announcements), {
        title: (title || "").trim(),
        body: (body || "").trim(),
        pinned: false,
        createdAt: serverTimestamp(),
      }),
    [],
  );

  const deleteAnnouncement = useCallback((id) => deleteDoc(doc(db, COL.announcements, id)), []);

  // Photo → downscale (1600px q0.86 via lib/images) → channel-namespaced
  // Storage path (rules can gate reads to the channel's audience) → posted
  // as an attachment message, exactly like the v1 pipeline.
  const sendImage = useCallback(
    async (file, channelId) => {
      const { blob } = await downscaleChatImage(file);
      const ch = channelId || TEAM_CHANNEL;
      const path = `chat/${ch}/${uid}/${Date.now()}.jpg`;
      const snap = await uploadBytes(storageRef(storage, path), blob, { contentType: "image/jpeg" });
      const url = await getDownloadURL(snap.ref);
      await addMessage("", {
        attachment: { type: "image", url, path, name: file.name || "photo.jpg" },
        channel: ch,
      });
    },
    [uid, addMessage],
  );

  // One-time, idempotent backfill (coach only, once per session): stamp
  // audienceKeys onto legacy channels/messages created before server-side
  // visibility existed, so the players' audience-filtered queries don't skip
  // them. (Events are owned by the calendar feature.)
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (!isAdmin || backfilledRef.current) return;
    const pending = [];
    (chatGroups || []).forEach((c) => {
      if (c.audienceKeys === undefined) {
        pending.push({
          ref: doc(db, COL.chatGroups, c.id),
          data: { audienceKeys: audienceKeysFor(c.visibleTo, groupsList) },
        });
      }
    });
    if (!pending.length) return;
    backfilledRef.current = true;
    (async () => {
      try {
        const snap = await getDocs(collection(db, COL.messages));
        snap.docs.forEach((d) => {
          const m = d.data();
          if (m.audienceKeys === undefined) {
            const ch =
              m.channel && m.channel !== TEAM_CHANNEL
                ? (chatGroups || []).find((c) => c.id === m.channel)
                : null;
            pending.push({
              ref: d.ref,
              data: { audienceKeys: ch?.audienceKeys?.length ? ch.audienceKeys : ["*"] },
            });
          }
        });
        for (let i = 0; i < pending.length; i += WRITE_CHUNK) {
          const batch = writeBatch(db);
          pending.slice(i, i + WRITE_CHUNK).forEach((u) => batch.update(u.ref, u.data));
          await batch.commit();
        }
      } catch {
        backfilledRef.current = false; // let it retry on the next render
      }
    })();
  }, [isAdmin, chatGroups, groupsList]);

  return {
    isAdmin,
    chatGroups: chatGroups || [],
    visibleChannels,
    groupsList: groupsList || [],
    announcements: announcements || [],
    dms: dms || [],
    dmThreads,
    scheduled: scheduled || [],
    allUsers: allUsers || [],
    invites: invites || [],
    rosterCount: (invites || []).length,
    nameByUid,
    nameByEmail,
    rosterPlayers,
    // writes
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
  };
}
