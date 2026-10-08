"use client";

import { AppFrame } from "@atrium/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function Frame({ children }: { children: ReactNode }) {
  return (
    <AppFrame surface="manager" pathname={usePathname()} linkAs={Link}>
      {children}
    </AppFrame>
  );
}
