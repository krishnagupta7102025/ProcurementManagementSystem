-- DropIndex
DROP INDEX IF EXISTS "users_centralLoginId_key";

-- DropIndex
DROP INDEX IF EXISTS "users_orgId_email_key";

-- AlterTable
-- Existing rows are local dev/demo data only, torn down and reseeded with
-- real password hashes right after this migration runs — the placeholder
-- default here (an unusable value, never a valid bcrypt hash) exists only
-- so the NOT NULL constraint can apply to any leftover rows before that.
ALTER TABLE "users" DROP COLUMN IF EXISTS "centralLoginId";
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT NOT NULL DEFAULT 'unset';
ALTER TABLE "users" ALTER COLUMN "passwordHash" DROP DEFAULT;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");
