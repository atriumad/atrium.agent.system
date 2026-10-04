import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

/** Renders and returns a user-event instance wired to the same document. */
export function setup(ui: ReactElement) {
  return { user: userEvent.setup(), ...render(ui) };
}

export { fireEvent, screen, waitFor, within } from "@testing-library/react";
