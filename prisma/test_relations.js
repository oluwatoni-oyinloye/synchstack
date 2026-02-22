import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🧪 Testing Prisma relationships...\n');

  // 1. Create a user
  const user = await prisma.user.create({
    data: {
      email: `user-${Date.now()}@example.com`,
      name: 'Test User'
    }
  });
  console.log('✅ Created user:', user.id, user.name);

  // 2. Create a project linked to user
  const project = await prisma.project.create({
    data: {
      name: 'My SynchStack Project',
      userId: user.id
    }
  });
  console.log('✅ Created project:', project.id, project.name);

  // 3. Create a service linked to project
  const service = await prisma.service.create({
    data: {
      name: 'users-service',
      type: 'microservice',
      projectId: project.id
    }
  });
  console.log('✅ Created service:', service.id, service.name);

  // 4. Create a deployment linked to service
  const deployment = await prisma.deployment.create({
    data: {
      version: 'v1.0.0',
      status: 'active',
      serviceId: service.id
    }
  });
  console.log('✅ Created deployment:', deployment.id, deployment.version);

  // 5. Query user with all nested relations
  const userWithEverything = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      projects: {
        include: {
          services: {
            include: {
              deployments: true
            }
          }
        }
      }
    }
  });

  console.log('\n✅ Relational query works! User with nested data:');
  console.log(JSON.stringify(userWithEverything, null, 2));
  
  console.log('\n🎉 All relationship tests passed!');
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
