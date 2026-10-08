"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { Me } from "../api";

const MeContext = createContext<Me | null>(null);

export function MeProvider({ me, children }: { me: Me; children: ReactNode }) {
  return <MeContext.Provider value={me}>{children}</MeContext.Provider>;
}

/** The signed-in person. Pages inside an `AppFrame` read who they are from here. */
export function useMe(): Me {
  const me = useContext(MeContext);
  if (!me) throw new Error("useMe needs an AppFrame");
  return me;
}
