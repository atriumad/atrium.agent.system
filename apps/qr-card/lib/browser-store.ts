import { cardStore } from "./storage";

/** The card store on this browser. Merely reading `localStorage` throws in some private modes. */
export function browserStore(): ReturnType<typeof cardStore> {
  try {
    return cardStore(window.localStorage);
  } catch {
    return cardStore(null);
  }
}
