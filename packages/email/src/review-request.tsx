import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Text,
} from "@react-email/components";

export type ReviewRequestProps = { placeName: string; link: string; unsubscribeUrl: string | null };

/** The email that asks a guest how the visit was. Docs: modules / Reputation. */
export function ReviewRequestEmail({ placeName, link, unsubscribeUrl }: ReviewRequestProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`How was your visit to ${placeName}?`}</Preview>
      <Body
        style={{
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#ffffff",
          color: "#111827",
        }}
      >
        <Container style={{ maxWidth: "480px", padding: "24px" }}>
          <Text
            style={{ fontSize: "18px", fontWeight: 600 }}
          >{`Thanks for visiting ${placeName}.`}</Text>
          <Text>How was your visit? It takes under a minute.</Text>
          <Button
            href={link}
            style={{
              backgroundColor: "#111827",
              color: "#ffffff",
              padding: "12px 20px",
              borderRadius: "8px",
            }}
          >
            Tell us how it went
          </Button>
          <Text style={{ fontSize: "13px", color: "#6b7280" }}>
            The link works once and expires in 7 days.
          </Text>
          {unsubscribeUrl ? (
            <>
              <Hr />
              <Text style={{ fontSize: "12px", color: "#6b7280" }}>
                You got this because you visited {placeName}.{" "}
                <Link href={unsubscribeUrl}>Unsubscribe</Link>
              </Text>
            </>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}
