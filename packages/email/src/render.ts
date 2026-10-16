import { render } from "@react-email/render";
import { ReviewRequestEmail, type ReviewRequestProps } from "./review-request";
import { SetPasswordEmail } from "./set-password";

export type Rendered = { html: string; text: string };

export async function renderReviewRequest(props: ReviewRequestProps): Promise<Rendered> {
  const element = ReviewRequestEmail(props);
  return { html: await render(element), text: await render(element, { plainText: true }) };
}

export async function renderSetPassword(props: { link: string }): Promise<Rendered> {
  const element = SetPasswordEmail(props);
  return { html: await render(element), text: await render(element, { plainText: true }) };
}
