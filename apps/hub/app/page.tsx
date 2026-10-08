import { Container, EmptyState } from "@atrium/ui";

export default function Home() {
  return (
    <Container className="py-16">
      <EmptyState title="Nothing here">
        Open the link from your review request to share how your visit went.{" "}
        <a href="/request-access">Own a restaurant? Request access.</a>
      </EmptyState>
    </Container>
  );
}
