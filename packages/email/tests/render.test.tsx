import { describe, expect, test } from "bun:test";
import { renderReviewRequest, renderSetPassword } from "../src";

describe("review request email", () => {
  test("has the place, the survey link as a button, the unsubscribe link, and a plain text twin", async () => {
    const { html, text } = await renderReviewRequest({
      placeName: "Casa Olivo",
      link: "https://hub.test/s/svy_abc",
      unsubscribeUrl: "https://hub.test/u/un1.x",
    });
    expect(html).toContain("Casa Olivo");
    expect(html).toContain('href="https://hub.test/s/svy_abc"');
    expect(html).toContain('href="https://hub.test/u/un1.x"');
    expect(text).toContain("Casa Olivo");
    expect(text).toContain("https://hub.test/s/svy_abc");
    expect(text).toContain("https://hub.test/u/un1.x");
    expect(text).not.toContain("<");
  });

  test("a place name cannot inject markup", async () => {
    const { html } = await renderReviewRequest({
      placeName: "<script>alert(1)</script>",
      link: "https://hub.test/s/svy_abc",
      unsubscribeUrl: null,
    });
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  test("without an unsubscribe url there is no unsubscribe link", async () => {
    const { text } = await renderReviewRequest({
      placeName: "Casa Olivo",
      link: "https://hub.test/s/x",
      unsubscribeUrl: null,
    });
    expect(text.toLowerCase()).not.toContain("unsubscribe");
  });
});

describe("set-password email", () => {
  test("has the link as a button and in the text", async () => {
    const { html, text } = await renderSetPassword({
      link: "https://platform.test/set-password?token=t",
    });
    expect(html).toContain('href="https://platform.test/set-password?token=t"');
    expect(text).toContain("https://platform.test/set-password?token=t");
  });
});
