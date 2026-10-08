import { Container, Eyebrow, SetPasswordForm } from "@atrium/ui";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <Container className="max-w-xl py-10">
      <Eyebrow>Welcome</Eyebrow>
      <h1 className="mt-2 mb-6 text-3xl font-normal">Choose your password</h1>
      <SetPasswordForm token={token ?? ""} />
    </Container>
  );
}
