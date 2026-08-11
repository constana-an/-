import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";

// storage.ts talks to the browser's localStorage; a Map-backed stand-in is
// enough to exercise the wallet rules without a browser.
const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
  clear: () => store.clear(),
};

const { OPENING_BALANCE, claimsKey, loadEconomyCoins, loadTaskClaims, walletKey } = await import("../src/lib/storage.ts");

beforeEach(() => store.clear());

test("a brand new wallet opens at the opening balance, not zero", () => {
  // Regression: Number(localStorage.getItem(missing)) is 0, not NaN.
  assert.equal(loadEconomyCoins("大宝"), OPENING_BALANCE);
  assert.equal(loadEconomyCoins("二宝"), OPENING_BALANCE);
});

test("each identity reads and keeps its own balance", () => {
  store.set("couple-shop-economy-version", "4");
  store.set(walletKey("大宝"), "120");
  store.set(walletKey("二宝"), "9");
  assert.equal(loadEconomyCoins("大宝"), 120);
  assert.equal(loadEconomyCoins("二宝"), 9);
});

test("each identity reads its own task claims", () => {
  store.set("couple-shop-economy-version", "4");
  store.set(claimsKey("大宝"), JSON.stringify(["2026-08-13:morning"]));
  assert.deepEqual(loadTaskClaims("大宝"), ["2026-08-13:morning"]);
  assert.deepEqual(loadTaskClaims("二宝"), []);
});

test("corrupt or negative balances fall back to the opening balance", () => {
  store.set("couple-shop-economy-version", "4");
  store.set(walletKey("大宝"), "not-a-number");
  assert.equal(loadEconomyCoins("大宝"), OPENING_BALANCE);
  store.set(walletKey("大宝"), "-5");
  assert.equal(loadEconomyCoins("大宝"), OPENING_BALANCE);
});

test("corrupt claim storage degrades to an empty list", () => {
  store.set("couple-shop-economy-version", "4");
  store.set(claimsKey("大宝"), "{not json");
  assert.deepEqual(loadTaskClaims("大宝"), []);
  store.set(claimsKey("大宝"), JSON.stringify(["ok", 7, null]));
  assert.deepEqual(loadTaskClaims("大宝"), ["ok"]);
});

test("the shared-wallet migration clears both wallets and the legacy keys", () => {
  store.set("couple-shop-economy-version", "3");
  store.set("couple-shop-coins", "203");
  store.set("couple-shop-task-claims", JSON.stringify(["2026-08-13:morning"]));
  store.set(walletKey("大宝"), "77");

  assert.equal(loadEconomyCoins("大宝"), OPENING_BALANCE);
  assert.equal(store.get("couple-shop-economy-version"), "4");
  assert.equal(store.has("couple-shop-coins"), false);
  assert.equal(store.has("couple-shop-task-claims"), false);
  assert.equal(loadEconomyCoins("二宝"), OPENING_BALANCE);
});

test("an identity-less first launch reports the opening balance and no claims", () => {
  assert.equal(loadEconomyCoins(null), OPENING_BALANCE);
  assert.deepEqual(loadTaskClaims(null), []);
});
