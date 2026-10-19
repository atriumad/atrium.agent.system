import { expect, test } from "bun:test";
import { pickLocale } from "../lib/locale";

test("pickLocale follows the q-values and falls back to English", () => {
  expect(pickLocale("es-ES,es;q=0.9,en;q=0.8")).toBe("es");
  expect(pickLocale("en-GB,es;q=0.5")).toBe("en");
  expect(pickLocale("fr-FR,es;q=0.3,en;q=0.2")).toBe("es");
  expect(pickLocale("de")).toBe("en");
  expect(pickLocale(null)).toBe("en");
  expect(pickLocale("es;q=0")).toBe("en");
});
