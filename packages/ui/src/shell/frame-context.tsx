"use client";

import { createContext, useContext } from "react";

type FrameActions = { refreshApprovals: () => void };

const FrameContext = createContext<FrameActions>({ refreshApprovals: () => {} });

export const FrameProvider = FrameContext.Provider;

/** What a page can ask of the frame around it. Outside a frame every action does nothing. */
export function useFrame(): FrameActions {
  return useContext(FrameContext);
}
