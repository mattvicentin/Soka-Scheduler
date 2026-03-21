/**
 * Set every account password to the same value (bcrypt-hashed like normal login).
 * Run: npm run db:set-passwords
 *
 * For local/dev use; do not run against production without understanding the risk.
 */
import { prisma } from "../lib/db/client";
import { hashPassword } from "../lib/auth/password";

const NEW_PASSWORD = "12345678";

async function main() {
  const passwordHash = await hashPassword(NEW_PASSWORD);
  const result = await prisma.account.updateMany({
    data: { passwordHash },
  });
  console.log(`Updated ${result.count} account(s) to password: ${NEW_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
