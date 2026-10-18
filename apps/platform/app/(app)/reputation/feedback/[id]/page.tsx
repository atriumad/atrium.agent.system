"use client";

import { CaseDetailPage } from "@atrium/ui";
import Link from "next/link";
import { use } from "react";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <CaseDetailPage surface="platform" id={id} linkAs={Link} />;
}
