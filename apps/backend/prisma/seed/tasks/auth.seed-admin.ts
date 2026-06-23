import { hash } from 'bcrypt';
import type { PrismaClient } from '@prisma/client';

const BCRYPT_SALT_ROUNDS = 12;

const DEFAULT_ADMIN = {
  email: 'admin@nexus.local',
  password: 'Admin@123456',
  nome: 'Admin',
  sobrenome: 'Nexus',
} as const;

export async function seedAdmin(prisma: PrismaClient): Promise<void> {
  const email = process.env.SEED_ADMIN_EMAIL ?? DEFAULT_ADMIN.email;
  const password = process.env.SEED_ADMIN_PASSWORD ?? DEFAULT_ADMIN.password;
  const nome = process.env.SEED_ADMIN_NOME ?? DEFAULT_ADMIN.nome;
  const sobrenome = process.env.SEED_ADMIN_SOBRENOME ?? DEFAULT_ADMIN.sobrenome;

  const hashedPassword = await hash(password, BCRYPT_SALT_ROUNDS);

  await prisma.user.upsert({
    where: { email },
    create: {
      nome,
      sobrenome,
      email,
      senha: hashedPassword,
      role: 'admin',
      email_confirmado_em: new Date(),
    },
    update: {
      nome,
      sobrenome,
      senha: hashedPassword,
      role: 'admin',
      email_confirmado_em: new Date(),
    },
  });

  console.log(`[seed:auth] Admin user ready: ${email}`);
}
