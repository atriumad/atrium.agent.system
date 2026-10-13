import { SurveyApp } from "./survey-app";

export default async function SurveyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SurveyApp token={token} />;
}
