# SynchStack

Microservices management platform with AI-powered insights.

## Current Status: Phase 2 (Data Layer) - 80% Complete

### What Works
- ✅ PostgreSQL database with Docker
- ✅ Prisma ORM with full schema (User → Project → Service → Deployment)
- ✅ All relationships working with cascading deletes
- ✅ Basic Users API with Swagger docs

### Quick Start

1. **Start database:**
```bash
   docker-compose up -d
```

2. **Install dependencies:**
```bash
   npm install
```

3. **Setup environment:**
```bash
   cp .env.example .env
```

4. **Generate Prisma client:**
```bash
   npx prisma generate
```

5. **Start API:**
```bash
   node services/users/v1/index.js
```

6. **View API docs:**
   Open http://localhost:3001/docs

### Next: Phase 2c
Connect Prisma to Express endpoints and add APIs for Projects, Services, Deployments.

## Tech Stack
- Node.js 22.22.0
- Express 5
- PostgreSQL 15
- Prisma 7
- Docker
