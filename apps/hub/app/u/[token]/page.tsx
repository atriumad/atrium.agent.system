import { UnsubscribeApp } from "./unsubscribe-app";

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <UnsubscribeApp token={token} />;
}
