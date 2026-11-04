-- Saved result of checking a student's password hash against their DOB default, so the credentials page
-- does not repeat a bcrypt compare per student on every load. Self-invalidating; see lib/students/studentDefaultPassword.ts.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "dobPasswordCheck" TEXT;
