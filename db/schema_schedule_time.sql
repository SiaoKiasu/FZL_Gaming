-- Adds an optional booking time window to each day's sign-up (5-minute
-- granularity, same-day only -- see ScheduleSignupForm). Run against the
-- same Postgres database as db/schema_schedule.sql. Two statements -- paste
-- and run them one at a time if the Neon Query tool complains about
-- multiple commands in one go.

ALTER TABLE signups ADD COLUMN IF NOT EXISTS start_minute INT;

ALTER TABLE signups ADD COLUMN IF NOT EXISTS end_minute INT;
