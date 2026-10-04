-- Core · retention of the idempotency ledger.
-- A consumer's record of "I handled event X" only has to outlive the longest redelivery window:
-- retries stop after at most a few hours, and pg-boss keeps jobs 14 days. The worker prunes
-- records older than 30 days. The app role may delete them (agency scope only, by policy).
grant delete on core.processed_events to atrium_app;
