const test = require("node:test");
const assert = require("node:assert");
const { chatKeyForMessage, chatKeyForDM, isMuted, shouldNotify, previewOn, mentionedUids, chatLine } = require("../lib/notify");

test("chat keys", () => {
  assert.equal(chatKeyForMessage({ channel: "team", teamId: "varsity" }), "team_varsity");
  assert.equal(chatKeyForMessage({ teamId: "jva" }), "team_jva");
  assert.equal(chatKeyForMessage({ channel: "abc123", teamId: "jva" }), "group_abc123");
  assert.equal(chatKeyForDM({ threadId: "u9" }), "dm_u9");
});

test("mute: always, until a time, expired", () => {
  assert.equal(isMuted({ muted: { team_varsity: -1 } }, "team_varsity"), true);
  assert.equal(isMuted({ muted: { team_varsity: 2000 } }, "team_varsity", 1000), true);
  assert.equal(isMuted({ muted: { team_varsity: 500 } }, "team_varsity", 1000), false);
  assert.equal(isMuted({}, "team_varsity"), false);
  assert.equal(isMuted(undefined, "x"), false);
});

test("shouldNotify: categories, mutes, mentions", () => {
  assert.equal(shouldNotify(undefined, { category: "chat" }), true); // defaults on
  assert.equal(shouldNotify({ chat: false }, { category: "chat" }), false);
  assert.equal(shouldNotify({ muted: { dm_u1: -1 } }, { category: "dms", chatKey: "dm_u1" }), false);
  assert.equal(shouldNotify({ muted: { team_v: -1 } }, { category: "chat", chatKey: "team_v", mentioned: true }), true);
  assert.equal(shouldNotify({ chat: false }, { category: "chat", mentioned: true }), false);
});

test("previews default on", () => {
  assert.equal(previewOn(undefined), true);
  assert.equal(previewOn({ preview: false }), false);
});

test("mentions by first or full name", () => {
  const members = [{ uid: "a", name: "Joey Fritz" }, { uid: "b", name: "Kellen Choi" }, { uid: "c", name: "Jo Smith" }];
  assert.deepEqual(mentionedUids("great goal @joey!", members), ["a"]);
  assert.deepEqual(mentionedUids("@KellenChoi and @jo.", members), ["b", "c"]);
  assert.deepEqual(mentionedUids("no tags here joey", members), []);
});

test("chat lines", () => {
  assert.equal(chatLine({ sender: "Joey", body: "hi", isGroup: true }), "Joey: hi");
  assert.equal(chatLine({ sender: "Joey", body: "hi", isGroup: false }), "hi");
});
