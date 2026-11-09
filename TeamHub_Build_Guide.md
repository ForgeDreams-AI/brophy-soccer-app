# TeamHub — Build & Deployment Guide

A practical, end-to-end guide for turning the `TeamHubRoles.jsx` demo into a live, real app hosted at **app.coachcameron.com**.

The demo proves the UX and the role model. This guide covers everything needed to make it real: accounts, data, security, login, wiring, and deployment.

---

## 1. What we're building

A mobile-first team app with two roles sharing one codebase:

- **Coach (admin)** — posts announcements, manages the calendar, uploads videos/links, manages the recipe library, sees team readiness, and moderates chat (delete + pin).
- **Player** — reads announcements/calendar/videos, submits a daily wellness check-in, logs food and rates how they felt, and uses team chat.

**Stack (all Google / Firebase):**

| Layer | Tool | Why |
|---|---|---|
| Hosting | Firebase Hosting | Free custom domain + SSL, no idle-pausing |
| Login | Firebase Auth | Email/password + Google sign-in, free to 50k monthly users |
| Database | Cloud Firestore | Real-time sync, generous free tier |
| File storage (optional) | Firebase Storage | Only if hosting images/files directly; videos use YouTube/Vimeo links |

**Cost for one team: $0/month** beyond the domain you already own. The only thing to watch at scale is Firestore reads — covered in §10.

> **Why not host on `coachcameron.com` directly?** That root domain already serves your existing site. We use the **`app.` subdomain** so the app is "on your domain" without touching what's already there.

---

## 2. Architecture at a glance

```
                    app.coachcameron.com
                            │
                  ┌─────────▼─────────┐
                  │  Firebase Hosting  │  ← static React build
                  └─────────┬─────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
  Firebase Auth        Firestore          (Storage)
  email + Google     collections        images/files
  role per user      (see §4)            (optional)
```

**The whole permission model is two layers:**

1. **UI gating** — the app hides admin buttons from players (already built in the demo via `isAdmin`).
2. **Security rules** — Firestore *rejects* any write a player shouldn't make, on the server, regardless of the UI (§5). This is the real enforcement. The hidden buttons are just polish.

---

## 3. Prerequisites & project setup

**Install:**
- Node.js 18+ and npm
- Firebase CLI: `npm install -g firebase-tools`
- A Google account that will own the project (and its billing, if you ever upgrade)

**Create the app and project:**

```bash
# 1. Scaffold a React app (Vite recommended)
npm create vite@latest teamhub -- --template react
cd teamhub
npm install
npm install firebase
npm install lucide-react        # icons used by the UI

# 2. Log in and create the Firebase project
firebase login
firebase projects:create teamhub-coachcameron   # or create it in the console
```

Drop `TeamHubRoles.jsx` into `src/` as your starting component, then wire it up per §6–§8.

---

## 4. Firestore data model

Each demo seed array maps to one Firestore collection. Fields below match what the UI already uses.

| Collection | Doc shape | Written by | Read by |
|---|---|---|---|
| `users/{uid}` | `{ name, email, role: "admin"\|"player", initials, position, team }` | self (create), admin (role) | all signed-in |
| `announcements/{id}` | `{ title, body, pinned, createdAt }` | admin | all |
| `events/{id}` | `{ title, date, start, end, location, type, createdAt }` | admin | all |
| `videos/{id}` | `{ title, url, cat, type, dur, diff, desc, createdAt }` | admin | all |
| `recipes/{id}` | `{ name, cat, cal, p, c, f, prep, createdAt }` | admin | all |
| `categories/{id}` | `{ name }` *(optional — see note)* | admin | all |
| `messages/{id}` | `{ senderUid, sender, initials, text, attachment?, pinned, isCoach, createdAt }` | author (create), admin (update/delete) | all |
| `wellnessCheckins/{uid}_{date}` | `{ uid, name, initials, feeling, soreness, tiredness, date, updatedAt }` | the player (own) | admin (team), player (own) |
| `logs/{uid}/entries/{id}` | `{ name, cal, p, c, f, feeling, time, createdAt }` | the player (own) | the player (own) |

**Notes:**
- **Categories** can be their own collection, or simpler: derive the category list from the distinct `cat` values across `recipes`. Deriving means there's no separate list to maintain. (Same idea works for video categories.)
- **Pinned messages**: store `pinned: true/false` as a field on the message — no separate "pinned" collection. The coach sets it; the pinned bar queries `where("pinned", "==", true)`.
- **Wellness doc ID** `{uid}_{date}` (e.g. `abc123_2026-06-08`) guarantees one check-in per player per day — submitting again just overwrites it.

---

## 5. Security rules (the real enforcement)

Save as `firestore.rules` and deploy with `firebase deploy --only firestore:rules`.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() { return request.auth != null; }
    function isOwner(uid) { return signedIn() && request.auth.uid == uid; }
    function isAdmin() {
      return signedIn() &&
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
    }

    // Profiles: anyone signed in can read; you create your own; only admin changes roles
    match /users/{uid} {
      allow read:   if signedIn();
      allow create: if isOwner(uid);
      allow update, delete: if isAdmin();
    }

    // Admin-writes / everyone-reads
    match /announcements/{id} { allow read: if signedIn(); allow write: if isAdmin(); }
    match /events/{id}        { allow read: if signedIn(); allow write: if isAdmin(); }
    match /videos/{id}        { allow read: if signedIn(); allow write: if isAdmin(); }
    match /recipes/{id}       { allow read: if signedIn(); allow write: if isAdmin(); }
    match /categories/{id}    { allow read: if signedIn(); allow write: if isAdmin(); }

    // Chat: anyone can post as themselves; only the coach edits/deletes/pins
    match /messages/{id} {
      allow read:   if signedIn();
      allow create: if signedIn() && request.resource.data.senderUid == request.auth.uid;
      allow update, delete: if isAdmin();
    }

    // Wellness: player writes only their own; coach reads the whole team
    match /wellnessCheckins/{docId} {
      allow read:  if isAdmin() || isOwner(resource.data.uid);
      allow write: if signedIn() && request.resource.data.uid == request.auth.uid;
    }

    // Food log: completely private to each player
    match /logs/{uid}/entries/{entryId} {
      allow read, write: if isOwner(uid);
    }
  }
}
```

> **Performance note:** `isAdmin()` does a document read each time it runs. Fine for one team. At larger scale, switch the role to a **custom auth claim** (set once, read free from the token) — see §7.

---

## 6. Firebase config & auth

**`src/firebase.js`** — paste the config from your Firebase console (Project settings → Your apps → Web):

```javascript
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "…",
  authDomain: "teamhub-coachcameron.firebaseapp.com",
  projectId: "teamhub-coachcameron",
  // …rest from console
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
```

**Enable sign-in methods** in the console: Authentication → Sign-in method → enable **Email/Password** and **Google**.

**`src/useAuth.js`** — tracks the logged-in user *and* their role:

```javascript
import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export function useAuth() {
  const [user, setUser] = useState(null);   // { uid, name, initials, role, … } | null
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (fbUser) => {
      if (!fbUser) { setUser(null); setLoading(false); return; }
      const ref = doc(db, "users", fbUser.uid);
      let snap = await getDoc(ref);
      if (!snap.exists()) {
        // First login → create a player profile by default
        const name = fbUser.displayName || fbUser.email.split("@")[0];
        const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
        await setDoc(ref, { name, email: fbUser.email, role: "player", initials });
        snap = await getDoc(ref);
      }
      setUser({ uid: fbUser.uid, ...snap.data() });
      setLoading(false);
    });
  }, []);

  return { user, loading };
}
```

**Replace the demo `LoginScreen`** so the buttons call real auth:

```javascript
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "./firebase";

// email/password
await signInWithEmailAndPassword(auth, email, password);

// Google
await signInWithPopup(auth, new GoogleAuthProvider());
```

The rest of the login UI stays exactly as built — only the click handlers change.

---

## 7. Making someone an admin

Pick one:

- **Simplest (one team):** after the coach signs up once, open the Firebase console → Firestore → `users` → their doc → change `role` from `"player"` to `"admin"`. Done.
- **Production-grade (scales, no per-check read):** set a **custom claim** with the Admin SDK (a one-time script or a small Cloud Function):

  ```javascript
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  ```

  Then in rules use `request.auth.token.admin == true` instead of the `get(...users...)` lookup, and read `role` from the token in the app. Recommended once you go multi-team.

---

## 8. Wiring the screens to Firestore

The pattern is identical for every screen: **replace each seed array with a live Firestore query, and replace each local `setX` with a Firestore write.** The component structure from the demo doesn't change.

**Live read (use everywhere the demo used a seed array):**

```javascript
import { useState, useEffect } from "react";
import { collection, query, orderBy, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

function useCollection(name, ...constraints) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const q = query(collection(db, name), ...constraints);
    return onSnapshot(q, (snap) =>
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
  }, [name]);
  return items;
}

// e.g. const announcements = useCollection("announcements", orderBy("createdAt", "desc"));
```

`onSnapshot` is real-time: when the coach posts, every player's screen updates live — no refresh.

**Admin write (announcement example):**

```javascript
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

await addDoc(collection(db, "announcements"), {
  title, body, pinned: false, createdAt: serverTimestamp(),
});
```

**Player write (wellness check-in example):**

```javascript
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

const today = new Date().toISOString().slice(0, 10);     // "2026-06-08"
await setDoc(doc(db, "wellnessCheckins", `${user.uid}_${today}`), {
  uid: user.uid, name: user.name, initials: user.initials,
  feeling, soreness, tiredness, date: today, updatedAt: serverTimestamp(),
});
```

**Coach reads the team's readiness (today only):**

```javascript
import { where } from "firebase/firestore";
const today = new Date().toISOString().slice(0, 10);
const wellness = useCollection("wellnessCheckins", where("date", "==", today));
```

**Bulk recipe import (the "From Sheet" feature):** parse the CSV client-side (the demo's `parseRecipeCSV` already does this), then batch-write:

```javascript
import { writeBatch, doc, collection } from "firebase/firestore";

const batch = writeBatch(db);
parsedRecipes.forEach((r) => batch.set(doc(collection(db, "recipes")), r));
await batch.commit();
```

**Feature → collection cheat sheet:**

| Screen / action | Collection | Write access |
|---|---|---|
| Post / pin / delete announcement | `announcements` | admin |
| Add / delete calendar event | `events` | admin |
| Upload / delete video or link | `videos` | admin |
| Add recipe / category / CSV import | `recipes` (+ `categories`) | admin |
| Submit wellness check-in | `wellnessCheckins` | player (own) |
| Coach views team readiness | `wellnessCheckins` (today) | admin reads |
| Log / rate food | `logs/{uid}/entries` | player (own, private) |
| Send chat message | `messages` | author |
| Pin / delete chat message | `messages` (update) | admin |

---

## 9. Deploy to app.coachcameron.com

```bash
# 1. Build
npm run build            # outputs to dist/ (Vite) or build/ (CRA)

# 2. Init hosting (point "public" to your build folder, configure as SPA)
firebase init hosting
#   - Public directory: dist
#   - Single-page app rewrite to /index.html: Yes
#   - Set up automatic builds with GitHub: optional

# 3. Deploy
firebase deploy
```

**Attach the subdomain:**
1. Firebase console → Hosting → **Add custom domain** → enter `app.coachcameron.com`.
2. Firebase shows a DNS record (usually an **A record**, plus a TXT for verification).
3. Add that record at wherever `coachcameron.com`'s DNS is managed (your registrar — GoDaddy, Squarespace, Namecheap, etc.).
4. Wait for propagation. **SSL is provisioned automatically** — no certificate work.

Your existing `coachcameron.com` site is untouched; only the new `app.` subdomain points to Firebase.

---

## 10. Cost & what to watch

For one team you're far inside the free **Spark** tier:

- 50,000 Firestore reads/day · 20,000 writes/day · 1 GiB stored
- 10 GB hosting storage · 360 MB/day transfer
- 50,000 monthly active auth users
- No idle-pausing, custom domain + SSL free

**The one real risk is Firestore reads.** A chat or feed that re-fetches everything on every screen visit can balloon read counts. Avoid it by:
- Using `onSnapshot` listeners (they only charge for actual changes, not repeated polling).
- Querying with limits where sensible (e.g. last 50 messages, today's events).
- Not re-mounting listeners on every navigation.

Set a billing alert in the Google Cloud console once you go live, just for peace of mind.

---

## 11. Later: multi-team (the SaaS path)

When this proves out and you want multiple teams/programs:
- Switch the admin role to a **custom claim** (§7).
- Add a `teamId` field to every document and a top-level `teams/{teamId}` collection; scope every query and rule by `teamId`.
- For per-team subdomains (`falcons.coachcameron.com`, etc.), **Cloudflare Pages** handles wildcard subdomains more cleanly than Firebase Hosting — keep Firebase Auth + Firestore, just swap the hosting layer.

But none of that is needed to prove a single season. Ship §1–§10 first.

---

## Build order (recommended)

1. Project + `firebase.js` + auth (§3, §6) — get login working, make yourself admin (§7).
2. **Announcements** end-to-end (read + admin write) — proves the full loop, real-time.
3. Calendar, Videos, Recipes — same admin-write pattern.
4. **Wellness** check-in + coach readiness view — the centerpiece of the coach side.
5. Food log (private) + chat (with pin/delete).
6. Deploy + attach the domain (§9).

Do step 2 and the whole loop clicks into place; everything after is the same pattern repeated.
