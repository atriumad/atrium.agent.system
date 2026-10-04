import { GlobalRegistrator } from "@happy-dom/global-registrator";

GlobalRegistrator.register({ url: "http://localhost:3000", width: 1280, height: 800 });

// Base UI positions popups with ResizeObserver and matchMedia; happy-dom has the first and not always the second.
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// Unmount between every test of every file. Registered here, once, so no file has to remember.
import { afterEach } from "bun:test";

const { cleanup } = await import("@testing-library/react");
afterEach(() => cleanup());
