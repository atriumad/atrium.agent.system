# Help requests as conversations (with shareable reviews)

Date: 2026-10-13 · Status: draft for review

## Why

A help request today is a single shot: the client's owner writes one note, and the agency can only
close it as Done or Declined with one reply. The owner cannot answer, so a real problem ("this
Google review is wrong, what do we do?") cannot be worked through. The Manager's buttons also
swallow errors (`RequestRow.handle` ends in `.catch(() => undefined)`), so a failed close looks like
nothing happened.

The agreed model: a help request is a **case that unfolds as a conversation**, where each side
answers in turn, and either side can attach a review to talk about it.

## Decisions (from the working session)

- Either side can close the case (option B). The owner closes as **Solved**. The agency closes as
  **Solved** or **Declined**. Declining is the agency's alone.
- A new message in a closed case reopens it. Closing is never a dead end.
- Both kinds of review can be shared: a **survey response** from the system and an **external
  review** (a Google review, or any other platform) as a link plus optional pasted text.
- Text only. No files, no real time, no unread counters, no editing or deleting messages, and no
  agent taking part in the thread. Those are out of scope.

## Who can do what (the existing role matrix, no new actions)

| Role | Read thread | Write | Close |
|---|---|---|---|
| `client_owner` (action `request`) | yes, own client | yes | Solved |
| `agency_admin`, `account_manager` (action `manage`) | yes | yes | Solved or Declined |
| `agency_staff` (action `forms`) | yes | no | no |
| `client_staff` | no | no | no |

Reading follows the rule `listSurveyRequests` already applies: roles with `forms` or `request`.

## Data (migration `0008_help_threads.sql`)

`reputation.survey_request_messages`

| Column | Notes |
|---|---|
| `id uuid pk` | |
| `request_id uuid` | fk to `survey_requests(id)` on delete cascade |
| `client_id uuid` | for RLS; must equal the request's client |
| `author_id text`, `author_name text` | |
| `side text` | `client` or `agency` (check) |
| `body text` | 1 to 2000 characters (check) |
| `attachment jsonb null` | validated shape below, enforced by a check on `attachment->>'kind'` |
| `created_at timestamptz` | |

Index `(request_id, created_at)`. RLS enabled and forced with the same policy as
`survey_requests` (`core.is_agency() or core.is_assigned(client_id) or client_id =
core.current_client_id()`); grants `select, insert` to `atrium_app` (messages are never updated or
deleted).

`reputation.survey_requests` gains `last_message_at timestamptz` and `last_author_side text`, so a
list can say whose turn it is. Its status values stay `open | fulfilled | dismissed`. The old
`response`, `handled_by` and `handled_at` columns stay for history; new closes still set
`handled_at` and `handled_by`.

**Backfill, in the same migration:** every existing request becomes a thread. Its `note` (if any)
is the first message by the requester (`side = client`, `author_id = requested_by`,
`author_name = requested_by_name`, `created_at = created_at`). Its `response` (if any) is a
second message by `handled_by` (`side = agency`, `created_at = handled_at`). `last_message_at` and
`last_author_side` are set from the newest message (or `created_at` and `client`).

### Attachments

- `{ "kind": "response", "responseId": "<uuid>" }`. Stores the id only. On read the server joins
  `survey_responses` and returns rating, comment, best-part or improve option, the agent's labels
  (sentiment, topics, concern, safety when present), date and location name. Contact details are
  never returned: a survey response has no contact data, only a guest id, and the join never
  touches the guest tables. RLS scopes the join to the request's client; posting an id that is not
  visible to the author, or that belongs to a different client than the request, is rejected
  (`422 attachment_not_found`).
- `{ "kind": "review", "url": "https://...", "rating": 1..5 (optional), "text": string (optional) }`.
  `url` must parse as `https:` and be at most 2048 characters; `text` at most 1000. The text is
  third-party content.

One attachment per message. An attachment alone (empty body) is not allowed: a message always has
a body.

## Use cases (`modules/reputation/application/help.ts`)

- `getThread(tx, scope, requestId)`: the request, its messages oldest first, attachments resolved.
- `postMessage(tx, scope, userName, requestId, { body, attachment })`:
  - checks the role (`request` for `client_owner`, `manage` for agency roles; the side is derived
    from the role, never sent by the client);
  - inserts the message, sets `last_message_at` and `last_author_side`;
  - if the request is `fulfilled` or `dismissed`, sets it back to `open` and clears `handled_at`
    and `handled_by`;
  - notifies everyone in `alertRecipients(tx, clientId)` except the author, with kind
    `reputation.help_message`, a short subject ("New message about <location>") and a link to the
    thread; the body of the notification never contains the message text beyond the first 140
    characters;
  - writes an audit entry `reputation.help_message_posted`.
- `closeRequest(tx, scope, requestId, to, message | null)`: `client_owner` may only use
  `fulfilled`; agency roles `fulfilled` or `dismissed`. A final message, when given, is posted
  first. It is a no-op error (`409 already_closed`) if the request is already closed. Writes
  `reputation.help_closed_<to>` to the audit log and notifies the other side as above.
- `createSurveyRequest` is kept and now also inserts the first message (the note, when present,
  plus the optional attachment). `handleSurveyRequest` is replaced by `closeRequest`.
- `listSurveyRequests` returns, per request, `lastMessageAt`, `lastAuthorSide`, a 140-character
  preview of the last message, and `awaiting` (`"client"` or `"agency"`: the side that did not
  write last, while the request is open).

Errors map as today: forbidden role → 403, request not found or not visible → 404, invalid input
→ 422, closing a closed request → 409.

## API (`apps/api/src/surveys-admin.ts`)

- `GET /surveys/requests` (list, new fields above)
- `POST /surveys/requests` (create; body `{ locationId, note, attachment? }`)
- `GET /surveys/requests/:id` → `{ request, messages }`
- `POST /surveys/requests/:id/messages` → body `{ body, attachment? }`, returns the message
- `POST /surveys/requests/:id/close` → body `{ to: "fulfilled" | "dismissed", message? }`
- `GET /surveys/responses/pickable?locationId=` (for the attach menu) returns the 20 most recent
  responses of the client's visible locations with date, rating and a 60-character excerpt. It
  requires the same roles that can read the thread and respects location scope.
- `POST /surveys/requests/:id/handle` is removed. `packages/ui/src/api.ts` is updated to match.

## Screens (`packages/ui`, one shared component)

`HelpThread` (new file `packages/ui/src/help-thread.tsx`), used by both apps with the layout of
the Cases page (list on the left, detail on the right):

- **Manager → Help requests** and **Platform → Help**. The list shows status, location, whose turn
  it is ("Waiting for you" or "Waiting for the client/agency"), time since the last message, and
  the preview.
- **Thread:** messages in order, each with author, side and time; attachments as cards (response
  card: rating, comment, labels, date, location; review card: platform link, stars, pasted text).
  The two sides are distinguished by alignment and a label, not by colour alone.
- **Composer:** text box, an **Attach** menu (External review: a link field plus optional text and
  stars; Survey response: a picker of recent responses), Send, and the close buttons allowed to
  the role (the owner sees *Mark as solved*; the agency sees *Mark as solved* and *Decline*). A
  closed case shows its closing state and the composer stays available (a message reopens it).
- **Errors are shown.** Any failed send or close shows a banner with a retry; nothing is swallowed.
- **Refresh:** the open thread and the list re-fetch every 15 seconds while the tab is visible and
  on focus. No websocket.
- **Platform → Responses:** a button *Ask for help about this* on a response opens the Help view
  with a new request and that response pre-attached (the owner writes the first message).

Review text and the pasted text are rendered as plain text. Links open with
`target="_blank" rel="noopener noreferrer"`. Nothing from a message or attachment is ever inserted
as HTML.

## Security and privacy

- Authorization is enforced in the use cases (`assertCan`) and again by RLS; the UI hides buttons
  but is not the control.
- The `side` of a message comes from the caller's role on the server.
- A survey response attachment exposes only what the agency already sees in Responses; never
  contact details.
- Pasted review text and message bodies are third-party text. They are not sent to any model in
  this work. If an agent reads threads later, it must treat them as `untrusted_input`.
- ADR 0018 is unaffected: nothing here touches who is asked for a review.

## Testing

- Application, against the real database (`modules/reputation/tests/help.test.ts`): role matrix
  for post and close (owner may close only as Solved; agency may Decline; staff cannot write);
  reopen on a new message; one notification per other party and none to the author; the
  notification body is truncated; closing twice returns 409; attachment validation (https only,
  length limits, response of another client rejected, response from a location the author cannot
  see rejected); contact data absent from a resolved response card; client isolation (a client
  cannot read another client's thread).
- Migration: the backfill turns a request with a note and a response into two ordered messages and
  one with only a note into one, and sets `last_author_side` correctly.
- API (`apps/api/tests/surveys-admin.test.ts` style): each route, status codes, role gates, the
  removed `/handle` route returns 404.
- UI (`packages/ui/tests`): thread renders both sides and both attachment kinds; the composer
  sends and clears; the owner does not see *Decline*; a failed send shows a banner; a closed case
  keeps the composer and a send reopens it; pasted review text containing `<script>` renders as
  text.
- End to end in the browser: the owner opens a case about a response from Responses, the account
  manager replies, the owner closes it as Solved, the manager's reply reopens it.

## Rollout

One migration (additive plus backfill; no column is dropped), then the API and the two apps. The
removed `/handle` route has no other caller than the Manager. No feature flag.

## Open risks

- Polling every 15 seconds is cheap at this scale but is not real time. A later subproject can add
  server-sent events without changing the data model.
- Without unread counters, a long list can hide a case that awaits the reader. The "whose turn"
  label and sorting by `last_message_at` are the mitigation for now.
- Threads are visible to `agency_staff` read-only; if a client later needs a thread private to its
  assigned manager, that is a policy change on this table.
