-- Signals · revision. How many times a day's value has been written: 1 on insert, +1 on every
-- re-run that replaces it. Ingestion uses it to tell inserts from replacements (a system column
-- like xmax cannot be returned from a partitioned table), and it shows which days were corrected.
alter table signals.signals_daily add column revision integer not null default 1 check (revision >= 1);
