import type { ReactNode } from "react";
import { Frame } from "./frame";

export default function Layout({ children }: { children: ReactNode }) {
  return <Frame>{children}</Frame>;
}
