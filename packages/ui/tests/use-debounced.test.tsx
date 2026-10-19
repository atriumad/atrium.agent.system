import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useDebounced } from "../src/data/use-debounced";

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

describe("useDebounced", () => {
  test("the value settles after the delay, and only the last one", async () => {
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 80), {
      initialProps: { v: "" },
    });
    rerender({ v: "c" });
    rerender({ v: "co" });
    expect(result.current).toBe("");
    await wait(40);
    rerender({ v: "col" });
    await wait(60);
    expect(result.current).toBe("");
    await wait(80);
    expect(result.current).toBe("col");
  });

  test("an immediate value applies in the same render", async () => {
    const { result, rerender } = renderHook(({ v }) => useDebounced(v, 80, (x) => x === ""), {
      initialProps: { v: "" },
    });
    rerender({ v: "cold" });
    await wait(120);
    expect(result.current).toBe("cold");
    rerender({ v: "" });
    expect(result.current).toBe("");
  });
});
