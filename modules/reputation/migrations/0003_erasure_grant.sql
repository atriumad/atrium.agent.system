-- Reputation · a pending review request for an erased guest is deleted, not just anonymized: it
-- must never send. The app role may delete from review_requests only.
grant delete on reputation.review_requests to atrium_app;
