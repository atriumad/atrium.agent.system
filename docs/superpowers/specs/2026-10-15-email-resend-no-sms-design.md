# Email with Resend, no SMS, Sentiment on a real model: design

Date: 2026-10-15
Status: draft for review
Part 1 of "complete the survey service and prepare Echo". Later parts: reviews coming in, then the Reputation metrics pipeline and screens.

## Goal

Make the survey service real end to end. Email leaves through Resend, with delivery tracking and a way to stop. SMS and Twilio are removed from the product, the schema and the documentation. Sentiment runs on a real model, with its cost visible, and the result is recorded.

## What was asked, and what I assumed

Asked: use Resend for sending and forget Twilio and SMS; the user adds the OpenRouter key; build what is needed to keep developing Echo; CSV import belongs later with the CRM module; complete the metrics.

Decided in this design session:
- **Part 1 is Resend plus a real Sentiment model.** Reviews coming in is part 2; the metrics pipeline and its screens are part 3.
- **One spec and one plan** for part 1, with SMS removal first so Resend lands on a clean schema.
- **SMS is removed completely, schema included.** Not only unused.
- **The guest's phone stays as a contact detail** for the team to call. It is no longer a channel and carries no SMS consent.
- **Webhooks: delivery status and blocking on bounce or spam.** No opens or clicks.

Assumptions to confirm:
- There is no real client data yet, so a migration may delete rows with channel `sms`.
- The review request is sent with the `marketing` purpose (it is today, `requests.ts`), so it needs a way to unsubscribe.
- The set-password email and the unsubscribe page are in scope although they were not asked for by name: both follow from "email is real".

## Where things are today

- `NotificationTransport` exists (`modules/core/domain/notifications.ts`) with only a `devTransport` that records and sends nothing. `sendToGuest` checks consent, delivers, and writes a masked row to the outbox. `sendToUser` does the same for the team.
- Only the agents service takes a transport (`createAgentsService({ transport })`). The API calls `postMessage`, `advanceCase` and manual invitations without one, so those messages use the development transport.
- The owner's set-password link is captured and shown to the approver; the code says real delivery "can later be added next to `onPasswordSetup`".
- `packages/email` is an empty directory. `EMAIL_FROM_DOMAIN` is the only email variable.
- SMS appears in: `CHANNELS` and `CHANNEL_IDENTIFIER` (`contact.ts`), the consent source `sms_stop`, `canSendSms`, `smsAllowed`, `setSmsRegistered` and the column `sms_registered` (`access`), `channel` checks in three migrations, `survey_invitations.channel`, the `channel` enums of two events, the signal type `sms_delivered`, Ask and Recovery (phone read through an `sms` consent), and about 62 documentation pages.
- Consent is an append-only log (`core.consents`); `recordOptOut(tx, guestId, channel, source)` ends every purpose on a channel at once.

## Architecture

```
API ──┐                        ┌─ Resend  POST /emails
agents ┼─ transportFromEnv ──► resendTransport ──┘
worker (no sends)               ▲
                                │ svix-signed events
API  POST /webhooks/resend ◄────┘   delivered · bounced · complained
Hub  GET/POST /u/<token>   ◄── link in the email footer
```

- `resendTransport` implements the existing port. `transportFromEnv(env)` returns it when `RESEND_API_KEY` is set and the development transport otherwise.
- The API and the agents service both build their transport from the environment and pass it to every send. The worker sends nothing.

## Components

### 1. Remove SMS (first, on its own)

- **Migrations.** One new migration in each of core, reputation and signals:
  - core: delete rows with channel `sms` from `consents` and `notifications`; change both `channel` checks to `email`; drop `packages.sms_registered`; replace the consent source `sms_stop` with `email_bounce` and `email_complaint` (the source list is a check constraint on `consents.source` in `0004_guests.sql`, so the migration drops and recreates that constraint).
  - reputation: `survey_invitations.channel` accepts `email` and `manual`.
  - signals: `sms_delivered` leaves the allowed `signal_type` list; rows of that type are deleted first.
- **The channel stays a column** with a single value (`email`). Removing it would rewrite every query for no gain, and another channel can return.
- **Code.** `CHANNELS = ["email"]`; `CHANNEL_IDENTIFIER` loses `sms`; `canSendSms`, `smsAllowed`, `setSmsRegistered`, the action `core.set_sms_registered` and the package field `smsRegistered` are deleted; Ask sends by email only; the two event schemas accept only `email`.
- **The phone.** When a response asks for contact, Recovery reads the guest's phone identifier directly, without a consent record: the switch "I would like someone to contact me" is the consent. The survey form keeps "email or phone" (one is required) and the case keeps showing "how to reach them".
- **Docs.** Every page that mentions SMS, Twilio or 10DLC is rewritten, English and Spanish: packages and services stop promising SMS, connector and data guides stop listing Twilio, and the signal list loses `sms_delivered`. ADR 0021 replaces 0017.

### 2. Resend transport

- `resendTransport({ apiKey, from, fetch? })`: `POST https://api.resend.com/emails` with `Authorization: Bearer`, `from`, `to`, `subject`, `html`, `text` and `Idempotency-Key`. It reads the provider's message id from the answer.
- `OutgoingMessage` gains `html: string | null` and `idempotencyKey: string | null`. `DeliveryStatus` becomes `recorded | sent | failed | delivered | bounced | complained`, and `deliver` returns `{ status, providerId }`.
- **Errors.** A 4xx (bad address, rejected content) returns `failed` and is recorded. A 429, a 5xx, a timeout or a network failure throws, so the caller retries. Errors carry a kind and a status only, never the address or the body.
- **Idempotency.** The review request sends with the request id as key, so a retry after a lost answer does not duplicate the email.
- **Template.** React Email in `packages/email`: `ReviewRequestEmail({ placeName, link, unsubscribeUrl })`, rendered to HTML and plain text. Internal alerts stay plain text. The outbox keeps only the plain text.
- **Sender.** `EMAIL_FROM` (for example `Atrium <no-reply@mail.example.com>`) replaces `EMAIL_FROM_DOMAIN`. Resend's sandbox sender can be used before the domain is verified.
- **Wiring.** `transportFromEnv` is called in the API's `server.ts` and the agents service's `main.ts`, and the result reaches every `sendToGuest` and `sendToUser` through the existing `deps.transport` seams. Outside development and test, both processes refuse to start without `RESEND_API_KEY`, `EMAIL_FROM` and `RESEND_WEBHOOK_SECRET`.

### 3. Webhooks and blocking

- `POST /webhooks/resend` on the API. Public, but every request is verified: `svix-id`, `svix-timestamp` and `svix-signature` against `RESEND_WEBHOOK_SECRET` (HMAC-SHA256 over `id.timestamp.body`, base64, constant-time compare, 5-minute tolerance). No valid signature, 401; the body is never parsed before that.
- `notifications` gains `provider_id`, indexed. An event updates the status of the row with that id: `email.delivered` to `delivered`, `email.bounced` to `bounced`, `email.complained` to `complained`. An unknown id answers 200 and is ignored; an event cannot move a status backwards.
- A hard bounce or a complaint calls `recordOptOut(tx, guestId, "email", "email_bounce" | "email_complaint")`. From then on `contactFor` denies that guest. A soft bounce or a delay changes nothing.
- Opens and clicks are not handled.

### 4. Unsubscribe

- The review request carries a footer link and the headers `List-Unsubscribe` and `List-Unsubscribe-Post`, pointing at the Hub page `/u/<token>`. The token is signed with `SURVEY_SECRET` and names the guest; it expires with the same rule as survey links.
- The page asks for one confirmation and then calls `recordOptOut(..., "email", "email_unsubscribe")`. A repeated visit is harmless and says so.

### 5. Set-password email

- On approving an account, the owner gets an email with the set-password link, in addition to the link shown to the approver. A short React Email template.
- The link is a credential, so the outbox stores a body without it ("A link to set your password was sent"). The real body goes only to the transport.

### 6. Sentiment on a real model

- The user sets `HOST_LLM_API_KEY` and `HOST_MODEL_SENTIMENT` (or `HOST_MODEL_DEFAULT`) in `.env.local`.
- `bun apps/agents/scripts/eval-sentiment.ts` runs the golden and hostile cases against that model. The model, the pass count and its data policy are recorded in ADR 0019, as that ADR requires before real clients.
- A live survey with a comment shows the labels, `read_model` and a positive `cost_tokens` in the audit log.

## Data flow: a review request

1. `ask.send_due` finds a due request and calls `reputation.send_review_request` through the gateway.
2. The tool checks consent, builds the template with a signed unsubscribe link, and calls `sendToGuest` with the request id as idempotency key.
3. Resend accepts it; the outbox row is `sent` with the provider id.
4. Resend later calls the webhook: the row becomes `delivered`, or `bounced` and the guest stops receiving email.
5. A 5xx from Resend throws, the Ask task fails, the request stays `scheduled`, and the next tick retries with the same key.

## Errors and rules kept

- The address never reaches the outbox (masked), a log, or an error. Provider errors carry a kind and a status.
- Consent is checked in `sendToGuest` and nowhere else; a denial is a returned answer, not an error.
- A refusal by policy is a decision and is not retried; a provider failure is retried (existing rule).
- The review link and who is asked for a review never depend on a rating or a reading (ADR 0018).
- No secret is stored in the outbox or in a log.

## Testing

- **SMS removal:** the existing core, reputation and signals tests are updated to the email-only model; a migration test applies the new migrations over rows that include `sms` data and checks the result; no code path mentions `sms`, checked with a grep test in CI.
- **Transport:** with an injected `fetch`: request shape and headers, the idempotency key, 4xx returns `failed`, 429/5xx/network throw, errors hold no address.
- **Webhook:** valid signature accepted; wrong secret, missing headers, a stale timestamp and a tampered body are 401 with nothing changed; unknown id is 200; a bounce marks the row, records the opt-out and the next send is denied; a status never moves backwards.
- **Unsubscribe:** valid token records the opt-out; a bad or expired token is refused; repeating is harmless.
- **Templates:** the HTML and the text contain the link and the footer; the outbox stores no HTML and no set-password link.
- **Live:** with a real `RESEND_API_KEY`, send the review request and the set-password email to the user's own address; post a signed webhook fixture to a local API and see the status change.
- **Sentiment:** the eval run and the live survey described above.

## Rollout

- New variables: `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `EMAIL_FROM`. Removed: `EMAIL_FROM_DOMAIN`, and every Twilio variable if any is listed.
- The Resend webhook must be configured in Resend to point at `<API_URL>/webhooks/resend`. It cannot reach a local machine; locally the signed fixture is used.
- A new migration set; no data migration beyond deleting SMS rows.
- Documentation in English and Spanish, with ADR 0021 (Resend, no SMS).

## Risks accepted

- Deleting `sms` consent and notification rows removes history from an append-only log. Acceptable only because there is no real data yet.
- The review request is the only guest email, so the unsubscribe page is small. It becomes shared when marketing email arrives.
- A bounce stops all email to that guest, including a later survey invitation. That is the safe default.

## Out of this part

Opens and clicks, marketing and CRM email, CSV import, reviews coming in and Echo (part 2), the Reputation metrics pipeline and screens (part 3), and email for the other surfaces' notifications beyond those listed.

## Success

1. A review request and a set-password email arrive in a real inbox, sent through Resend.
2. A signed bounce or complaint marks the notification and stops further email to that guest.
3. The unsubscribe link works, and a repeated visit is harmless.
4. No file, migration, test or documentation page mentions SMS, Twilio or 10DLC, except ADRs 0010 and 0017 as history.
5. Sentiment labels a real response with a real model, with `cost_tokens` in the audit log, and the evals and the model's data policy are recorded.
