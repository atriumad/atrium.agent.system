import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// jsdom does not apply the server/client boundary, so Next only fails at runtime.
// This scan keeps every module that needs the browser marked "use client".

const SRC = join(import.meta.dir, "..", "src");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const HOOKS =
  "useState|useEffect|useRef|useMemo|useCallback|useReducer|useId|useContext|useLayoutEffect|useTransition|useSyncExternalStore|useDeferredValue|useImperativeHandle|createContext";
const REACT_IMPORT = new RegExp(
  `import\\s*(?:type\\s*)?\\{[^}]*\\b(?:${HOOKS})\\b[^}]*\\}\\s*from\\s*["']react["']`,
);

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const hasDirective = (src: string) => /^\s*["']use client["']/.test(src);

describe("client-only modules say so", () => {
  for (const file of walk(SRC)) {
    const name = file.slice(SRC.length + 1);
    test(name, () => {
      const src = readFileSync(file, "utf8");
      if (hasDirective(src)) return;
      const code = stripComments(src);
      const why = REACT_IMPORT.test(code)
        ? "imports a client-only React hook"
        : /\b(window|document)\./.test(code)
          ? "uses window/document"
          : null;
      if (why) throw new Error(`src/${name} ${why} but does not start with "use client"`);
    });
  }
});
