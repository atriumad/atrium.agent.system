# Survey · permissions and owner self-service (subproject 1 of 5)

Date: 2026-10-08 · Status: draft for review

## Why

A client can have several locations, each with its own Google reviews and its own QR. Today a
client owner can only *ask* the agency for a form; the agency does everything. The agreed model
is **hybrid**: the owner runs the day-to-day (see and download the QR of each location, make
one-off links, set the send delay) and the account manager (AM) only assists when asked and owns
the risky settings. A location manager (`client_staff`) sees the answers and cases of their own
location, nothing else.

## Decisions (from the working session)

- Hybrid ownership: owner self-serves, AM assists.
- Owner cannot edit the Google review link or rotate the QR (a wrong link breaks every guest's
  flow; rotating invalidates every printed QR). The owner asks for those through **Help**.
- `client_staff` reads responses and cases of assigned locations only; no QR, no settings.
- Out of scope here: printable card (subproject 2), ES/EN (3), case escalation (4), live setup (5).
  Not now at all: reply templates, anonymous-case handling, trend reports, per-client card design.

## Permission matrix

`survey` actions in `modules/core/domain/roles.ts`:

| Action | Covers |
|---|---|
| `read` | Responses and recovery cases |
| `forms` | Locations, QR, printable card (new) |
| `operate` | Manual one-off links, request delay (new) |
| `manage` | Google review link, rotate QR (narrowed) |
| `request` | "I need help" request |

| Role | read | forms | operate | manage | request |
|---|---|---|---|---|---|
| agency_admin, account_manager | yes | yes | yes | yes | |
| agency_staff | yes | yes | | | |
| client_owner | yes | yes | yes | | yes |
| client_staff | yes (own locations) | | | | |

## Location isolation (gap found)

Reputation RLS policies scope by client only. `core.visible_location_ids()` exists (null = every
location, list = narrowed) but Reputation does not use it, so a location-scoped `client_staff`
would see every location of the client.

- Migration `0006_location_scope.sql`: replace the `survey_responses` and `recovery_cases`
  policies so a row is visible only if `core.visible_location_ids() is null` or
  `location_id = any(core.visible_location_ids())`, in addition to the existing client checks.
  Same for `with check`.
- Application layer: `listSurveyResponses` and case listing also filter with `locationVisible`,
  so isolation does not rest on one layer.
- Location lists (`listLocationLabels`) already follow Core's location scope; verify in tests.

## API (`apps/api/src/surveys-admin.ts`, `cases.ts`)

- `GET /surveys/forms` requires `forms`. `GET /surveys/responses` requires `read`.
- `POST /surveys/forms/:id/link` requires `operate` (was `manage`).
- `PUT /surveys/forms/:id/settings`: `requestDelayMinutes` requires `operate`; `reviewUrl`
  requires `manage` and returns 403 for a caller without it, even if the delay is also sent.
- `POST /surveys/forms/:id/rotate-qr` stays `manage`.
- `/me` adds `canViewForms` and `canOperateSurveys`; the UI reads capabilities, not roles.
- Use-case checks (`assertCan` in `modules/reputation/application/admin.ts`) move to the new
  actions; routes keep translating errors only. Audit entries keep recording the actor.

## Screens

- **Platform `/surveys`** (owner and location manager) becomes a workspace with tabs:
  - *Responses*: owner sees all locations; location manager sees only theirs.
  - *My locations* (needs `forms`): one card per location with QR, copy link, one-off link and
    send delay. "Edit review link" and "Rotate QR" are disabled with "Ask for help from the Help tab".
  - *Help*: the current request form, reworded as "I need help" (change the Google link, rotate
    the QR, anything else). Same `survey_requests` table and flow.
- **Manager `/surveys`**: structure unchanged; Requests tab keeps handling help requests.
- `FormCard` in `packages/ui/src/surveys-app.tsx` takes capability flags; no duplicate component.

## Testing

- Role matrix: every role against every action (`modules/core` tests).
- RLS: location manager of location A sees no responses or cases of location B of the same
  client; owner and agency see both.
- API: owner gets 403 on `reviewUrl` change and on rotate-qr; 200 on one-off link and delay; a
  request mixing `reviewUrl` and delay from an owner is rejected whole.
- `client_staff` gets 403 on `GET /surveys/forms`.
- UI: card actions follow capability flags; Platform tabs per role.

## Risks

- Narrowing `manage` changes behavior for the current Manager screens; check each button maps to
  the right action.
- Dropping location filter gaps: any other Reputation table read by `client_staff` later must
  adopt the same policy; list this in the migration comment.
