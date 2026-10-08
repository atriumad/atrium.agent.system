import type { ReactNode } from "react";
import { Banner } from "../feedback/banner";

/** What a page shows when the person's role cannot use it, instead of an error from the API. */
export function NotAvailable({ children }: { children?: ReactNode }) {
  return (
    <Banner status="neutral" title="Not available for your role">
      {children ?? "Ask the account owner or the Atrium team if you need this."}
    </Banner>
  );
}
