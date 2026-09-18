-- Adds an optional booking time window to each day's sign-up (5-minute
-- granularity, same-day only -- see ScheduleSignupForm). Run against the
-- same Postgres database as db/schema_schedule.sql.
--
-- This is a single ALTER TABLE statement (two ADD COLUMN clauses inside it
-- still count as one command), so it should paste into the Neon Query tool
-- and run in one go.

ALTER TABLE signups
  ADD COLUMN IF NOT EXISTS start_minute INT,
  ADD COLUMN IF NOT EXISTS end_minute   INT;
