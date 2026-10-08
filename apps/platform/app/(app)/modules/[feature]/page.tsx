import { ModulePage } from "@atrium/ui";

export default async function Page({ params }: { params: Promise<{ feature: string }> }) {
  const { feature } = await params;
  return <ModulePage feature={feature} />;
}
