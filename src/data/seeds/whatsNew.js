// User-facing changelog shown in the "What's New" screen. Add a new entry to the
// TOP for each release and bump its `version`. When the app loads and the top
// version differs from the one a returning user last saw, the What's New screen
// pops once automatically; it's always reachable from Settings.
export const RELEASES = [
  {
    version: "1.8.0",
    date: "2026-08-01",
    title: "Scheduled reminders & polls + chat polish",
    items: [
      "Coaches can schedule reminders — set a title, message, who it goes to, and a date/time, and it sends itself as a push. Find it under the Scheduled button on the Chat tab.",
      "Schedule polls too — queue a poll to post automatically to the team or any group chat at a set time.",
      "Make either one repeat — daily, weekly, or custom days (e.g. Mon/Wed/Fri) — so recurring reminders and check-in polls run themselves.",
      "Add auto reminders right on an event — e.g. ping the team 1 hour before, or auto-post a 'Who's making it?' poll a day before. Pick any custom lead time; they fire and clean up automatically.",
      "Food logging is faster: your recent foods and a Saved favorites list show up as one-tap chips, so foods you eat often re-log without re-typing. Star a food to save it, or tap the pencil to tweak the portion first.",
      "Links in chat are now tappable and open in a new tab.",
      "Team Documents now accepts Word, PowerPoint, Excel and more — not just PDFs and images — with a type badge on each file.",
      "The group-chat 'Specific people' picker now shows players by name instead of email.",
      "Game-day line-ups carry your team logo watermarked in the center; upload your own from Game Day.",
    ],
  },
  {
    version: "1.7.0",
    date: "2026-07-26",
    title: "Coach Center + Game Day line-ups",
    items: [
      "The Practice tab is now Coach Center — one door for Practice (drills, sessions, programs) and a new one for Game Day.",
      "Game Day: build a starting XI on the pitch. Pick a formation, tap a spot to drop in a player, and drag to fine-tune positions.",
      "Add profile photos — players can set their own from Settings, and coaches can add a photo for anyone right from the line-up picker.",
      "Each player shows their photo with their name underneath. Name the line-up whatever you want and save it.",
      "Send any saved line-up to any team chat as an image, straight from Game Day.",
    ],
  },
  {
    version: "1.6.0",
    date: "2026-07-14",
    title: "Chat day separators",
    items: [
      "Chats now break by day with a Today / Yesterday / date line, in both the team channel and direct messages.",
    ],
  },
  {
    version: "1.5.0",
    date: "2026-07-14",
    title: "Tactics board: field types, dribbles, pass order",
    items: [
      "Field selector now includes soccer surfaces — full pitch, half, attacking third, penalty box — plus basketball, football and blank.",
      "New Dribble draw type — a wavy line for taking players on.",
      "Passes are auto-numbered along the line so the order of a passing sequence is clear.",
    ],
  },
  {
    version: "1.4.0",
    date: "2026-07-14",
    title: "Quote of the Day + chat upgrades",
    items: [
      "New Quote of the Day — coaches post a quote from Home and it goes out to the team as a push notification.",
      "Chat tab now shows a number badge for unread messages.",
      "Opening any chat jumps straight to the newest messages.",
      "Video library now embeds Instagram posts & reels (public links), alongside YouTube and Vimeo.",
      "Calendar events with a practice or workout attached now show the plan/exercises and open into the full details.",
      "Players can check themselves in for today's session — coaches see it live on the attendance board.",
      "Tactics board upgraded: neutral players, a white field-line draw tool, goals, and a soccer / basketball / football / blank field selector.",
    ],
  },
  {
    version: "1.3.0",
    date: "2026-07-10",
    title: "Tactics board + starter workouts",
    items: [
      "New drill tactics board — drag players, the ball and cones on a pitch and draw runs/passes, then save it as the drill diagram (TacticalPad-style).",
      "One-tap “Starter set” adds 20 ready-made team workouts, grouped by focus area (Strength, Speed & Power, Conditioning, Recovery & Care, Soccer).",
      "Team Workouts are now organized by focus area.",
    ],
  },
  {
    version: "1.2.0",
    date: "2026-07-08",
    title: "Training tools + starter content",
    items: [
      "Strength templates in Team Workouts — 5×5, hypertrophy, and soccer off/in-season sessions in one tap.",
      "Prescribe loads by % of an athlete's max, with optional RPE, tempo, and supersets.",
      "Add 20 ready-made starter lifts to the exercise library in one tap.",
      "Add 120 whole-food starter recipes, browsable by meal and food type.",
      "You'll now get a refresh prompt when a new version is available — and this What's New page.",
    ],
  },
];

export const APP_VERSION = RELEASES[0]?.version || "1.0.0";
