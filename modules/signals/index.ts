/** Public API of Signals. Other modules import this file, never its tables. */

export type { IngestDeps, IngestResult } from "./application/ingest";
export { IngestionRejected, ingestSignals } from "./application/ingest";
export {
  authenticateToken,
  createConnectorToken,
  generateToken,
  hashToken,
  revokeConnectorToken,
} from "./application/tokens";
export type { BatchCheck, Principal, Problem, ProblemCode } from "./domain/ingestion";
export { checkBatch, latestDate, monthsOf, summarize } from "./domain/ingestion";
