"use client";

import { type ReactNode, useEffect, useState } from "react";
import { ApiError, api, type Me } from "./api";
import { SignIn, type Surface } from "./cases-app";
import { Banner } from "./feedback/banner";
import { Container } from "./layout/layout";

/** Signs in if needed, then hands the signed-in person to the page. */
export function SessionGate({
  surface,
  children,
}: {
  surface: Surface;
  children: (me: Me) => ReactNode;
}) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch((e: unknown) => {
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setMe(null);
        else setUnreachable(true);
      });
  }, []);

  if (unreachable) {
    return (
      <Container className="py-16">
        <Banner status="danger" title="Cannot reach the server">
          Check that the API is running, then reload.
        </Banner>
      </Container>
    );
  }
  if (me === undefined) return <Container className="py-8" />;
  if (me === null) return <SignIn surface={surface} />;
  return <Container className="py-8">{children(me)}</Container>;
}

/** Who is signed in, with the way out. */
export function Account({ me }: { me: Me }) {
  return (
    <div className="text-right text-sm">
      <p className="m-0">{me.name}</p>
      <p className="m-0 text-fg-muted">{me.role.replaceAll("_", " ")}</p>
      <button
        type="button"
        onClick={async () => {
          await api.signOut().catch(() => undefined);
          location.reload();
        }}
        className="cursor-pointer underline underline-offset-4 hover:text-clay-600"
      >
        Sign out
      </button>
    </div>
  );
}
