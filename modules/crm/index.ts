/** Public API of CRM. Other modules import this file, never its tables. */

export type {
  ActivityKind,
  ActivityRow,
  LoyaltyCardProgress,
  LoyaltySummary,
  StaffCard,
} from "./application/activity";
export { getLoyaltyCard, listActivity, lookupCard, loyaltySummary } from "./application/activity";
export type { CardView, IssueResult } from "./application/cards";
export { getCardByToken, issueCard } from "./application/cards";
export type { AttachEmailResult } from "./application/email";
export { attachEmail } from "./application/email";
export { crmErasureConsumer, eraseGuestCards } from "./application/erasure";
export type { ProgramInput } from "./application/program";
export { getProgram, joinToken, rotateJoinQr, upsertProgram } from "./application/program";
export { checkRate } from "./application/rate";
export type { Accent, CrmDeps, Program } from "./application/shared";
export {
  CardNotFoundError,
  InvalidProgramError,
  InvalidStampInputError,
  LoyaltyForbiddenError,
  NoRewardError,
  NothingToVoidError,
  StampRefusedError,
} from "./application/shared";
export type { CardLookup, StampResult } from "./application/stamps";
export { redeemReward, stampCard, voidLastStamp } from "./application/stamps";
export { ACCENTS } from "./domain/loyalty";
export { LIMITS } from "./domain/rate";
export type { SummaryRange, Tile } from "./domain/summary";
export {
  hashCardToken,
  looksLikeCardToken,
  normalizeShortCode,
  signJoinToken,
} from "./domain/tokens";
export { crmTools } from "./mcp/tools";
