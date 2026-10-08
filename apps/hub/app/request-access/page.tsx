import { Container, Eyebrow, RequestAccessForm, Wordmark } from "@atrium/ui";

export default function Page() {
  return (
    <Container className="max-w-xl py-10">
      <Wordmark size="sm" />
      <div className="mt-8 mb-6">
        <Eyebrow>Request access</Eyebrow>
        <h1 className="mt-2 mb-2 text-3xl font-normal">Bring your restaurant to Atrium</h1>
        <p className="m-0 text-fg-muted">
          Tell us who you are and which place to start with. We review every request and write back.
        </p>
      </div>
      <RequestAccessForm />
    </Container>
  );
}
