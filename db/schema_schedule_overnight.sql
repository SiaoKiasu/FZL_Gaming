-- Marks whether a booking's end time falls on the day AFTER signup_date.
-- This is an explicit choice the member makes in the form (a "次日"
-- checkbox), not something inferred by comparing start_minute/end_minute --
-- comparing clock times to guess the day turned out to be more confusing
-- than just asking. Run against the same Postgres database as
-- db/schema_schedule_time.sql.

ALTER TABLE signups
  ADD COLUMN IF NOT EXISTS end_next_day BOOLEAN NOT NULL DEFAULT false;
