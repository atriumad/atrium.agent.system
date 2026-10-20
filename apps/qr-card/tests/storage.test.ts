import { expect, test } from "bun:test";
import { cardStore, type StorageLike } from "../lib/storage";

const T1 = "A".repeat(22);
const T2 = "b-_".repeat(7) + "c";

function memory(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
    key: (i) => [...data.keys()][i] ?? null,
    get length() {
      return data.size;
    },
  };
}

test("save, load, list and forget a card by program", () => {
  const m = memory();
  const store = cardStore(m);
  store.save("p1", T1);
  store.save("p2", T2);
  expect(m.data.get("atr_card:p1")).toBe(T1);
  expect(store.load("p1")).toBe(T1);
  expect(store.load("nope")).toBeNull();
  expect(store.list()).toEqual([
    { programId: "p1", token: T1 },
    { programId: "p2", token: T2 },
  ]);
  store.forget("p1");
  expect(store.load("p1")).toBeNull();
  expect(store.list()).toEqual([{ programId: "p2", token: T2 }]);
});

test("email done and the hint flag use their own keys", () => {
  const m = memory();
  const store = cardStore(m);
  expect(store.emailDone("ABCD-EFGH")).toBe(false);
  store.markEmailDone("ABCD-EFGH");
  expect(store.emailDone("ABCD-EFGH")).toBe(true);
  expect(m.data.has("atr_card_email:ABCD-EFGH")).toBe(true);
  expect(store.hintDismissed()).toBe(false);
  store.dismissHint();
  expect(store.hintDismissed()).toBe(true);
  expect(m.data.has("atr_card_hint")).toBe(true);
  expect(store.list()).toEqual([]);
});

test("Review Focus 4: a storage that throws on every call, or null, never throws", () => {
  const broken = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceeded");
    },
    removeItem() {
      throw new Error("x");
    },
    key() {
      throw new Error("x");
    },
    get length(): number {
      throw new Error("x");
    },
  };
  for (const s of [broken, null]) {
    const store = cardStore(s as never);
    expect(() => store.save("p", T1)).not.toThrow();
    expect(store.load("p")).toBeNull();
    expect(() => store.forget("p")).not.toThrow();
    expect(store.list()).toEqual([]);
    expect(store.emailDone("ABCD-EFGH")).toBe(false);
    expect(() => store.markEmailDone("ABCD-EFGH")).not.toThrow();
    expect(store.hintDismissed()).toBe(false);
    expect(() => store.dismissHint()).not.toThrow();
  }
});

test("list ignores keys that are not cards and values that are not card tokens", () => {
  const m = memory();
  m.data.set("atr_card:p1", T1);
  m.data.set("atr_card:bad", "short");
  m.data.set("atr_card:evil", `${T1}<script>`);
  m.data.set("atr_card_email:ABCD-EFGH", "1");
  m.data.set("atr_card_hint", "1");
  m.data.set("other", T2);
  const store = cardStore(m);
  expect(store.list()).toEqual([{ programId: "p1", token: T1 }]);
  expect(store.load("bad")).toBeNull();
  expect(store.load("evil")).toBeNull();
  store.save("p3", "short");
  expect(m.data.has("atr_card:p3")).toBe(false);
});
