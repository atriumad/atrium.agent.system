import { Body, Button, Container, Head, Html, Preview, Text } from "@react-email/components";

/** The email that lets a new owner choose a password. The link is a credential: nothing stores it. */
export function SetPasswordEmail({ link }: { link: string }) {
  return (
    <Html lang="en">
      <Head />
      <Preview>Set your Atrium password</Preview>
      <Body
        style={{
          fontFamily: "system-ui, sans-serif",
          backgroundColor: "#ffffff",
          color: "#111827",
        }}
      >
        <Container style={{ maxWidth: "480px", padding: "24px" }}>
          <Text style={{ fontSize: "18px", fontWeight: 600 }}>Welcome to Atrium.</Text>
          <Text>Your account was approved. Choose a password to sign in.</Text>
          <Button
            href={link}
            style={{
              backgroundColor: "#111827",
              color: "#ffffff",
              padding: "12px 20px",
              borderRadius: "8px",
            }}
          >
            Set your password
          </Button>
          <Text style={{ fontSize: "13px", color: "#6b7280" }}>
            The link works once and expires soon. If you did not ask for this, ignore the email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
