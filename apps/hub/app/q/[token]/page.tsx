import { SurveyApp } from "../../s/[token]/survey-app";

export default async function QrSurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SurveyApp token={token} kind="qr" />;
}
