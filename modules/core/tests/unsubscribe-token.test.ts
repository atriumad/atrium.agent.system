import { describe, expect, test } from "bun:test";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "../domain/unsubscribe";

const client = "0b2f1c4e-6a5d-4f0e-9a39-2f6f4b8d1c11";
const guest = "7c1d2e3f-0a1b-4c2d-8e3f-4a5b6c7d8e9f";

describe("unsubscribe tokens", () => {
  test("round trip, and the token names the client and the guest", () => {
    const token = signUnsubscribeToken("s3cret", client, guest);
    expect(token.startsWith("un1.")).toBe(true);
    expect(verifyUnsubscribeToken("s3cret", token)).toEqual({ clientId: client, guestId: guest });
  });

  test("another secret, a tampered id or signature, a truncated token and junk are refused", () => {
    const token = signUnsubscribeToken("s3cret", client, guest);
    expect(verifyUnsubscribeToken("other", token)).toBeNull();
    expect(verifyUnsubscribeToken("s3cret", token.replace(guest, client))).toBeNull();
    expect(verifyUnsubscribeToken("s3cret", `${token}x`)).toBeNull();
    expect(verifyUnsubscribeToken("s3cret", token.slice(0, -4))).toBeNull();
    expect(verifyUnsubscribeToken("s3cret", "un1.not-a-uuid.not-a-uuid.sig")).toBeNull();
    expect(verifyUnsubscribeToken("s3cret", "")).toBeNull();
    expect(verifyUnsubscribeToken("s3cret", "svy_abc")).toBeNull();
  });
});
