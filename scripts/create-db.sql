-- ─────────────────────────────────────────────────────────────────────────────
-- SkillForCareer LMS — create the application database on TiDB Cloud.
--
-- Prisma refuses TiDB's `sys` schema (P3004 "system database"), so the app uses
-- a dedicated `lms` database. Run this SQL while connected to the always-present
-- `test` schema (see BOOTSTRAP_DATABASE_URL in .env), then point DATABASE_URL at
-- `.../lms` and run `npm run db:push`.
--
-- Convenience wrapper: `npm run db:create` (scripts/create-db.mjs).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE DATABASE IF NOT EXISTS `lms`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_general_ci;
