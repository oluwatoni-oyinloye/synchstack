require('dotenv').config();
const express = require("express");
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Database connection
const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 20, // Connection pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ====== Helper Functions ======

/**
 * Validates UUID format
 */
function isValidUUID(uuid) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validates email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Generic error handler for Prisma errors
 */
function handlePrismaError(error, res, defaultMessage = "Operation failed") {
  console.error(error);

  // Unique constraint violation
  if (error.code === 'P2002') {
    const field = error.meta?.target?.[0] || 'field';
    return res.status(400).json({ 
      error: `${field} already exists` 
    });
  }

  // Foreign key constraint violation
  if (error.code === 'P2003') {
    const field = error.meta?.field_name || 'reference';
    return res.status(404).json({ 
      error: `Related ${field} not found` 
    });
  }

  // Record not found
  if (error.code === 'P2025') {
    return res.status(404).json({ 
      error: "Resource not found" 
    });
  }

  // Generic error
  return res.status(500).json({ 
    error: defaultMessage 
  });
}

/**
 * Wraps async route handlers to catch errors
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Pagination helper
 */
function getPagination(req) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
  const skip = (page - 1) * limit;
  
  return { page, limit, skip };
}

// ====== Users ======

/**
 * GET /users - List all users with optional pagination
 * Query params: ?page=1&limit=50&includeNested=true
 */
app.get("/users", asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const includeNested = req.query.includeNested === 'true';

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      take: limit,
      skip: skip,
      include: includeNested ? {
        projects: {
          include: {
            services: {
              include: { deployments: true }
            }
          }
        }
      } : undefined,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.user.count()
  ]);

  res.json({
    data: users,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}));

/**
 * POST /users - Create a new user
 * Body: { email: string, name: string }
 */
app.post("/users", asyncHandler(async (req, res) => {
  const { email, name } = req.body;

  // Validation
  if (!email || !name) {
    return res.status(400).json({ 
      error: "email and name are required" 
    });
  }

  if (typeof email !== 'string' || typeof name !== 'string') {
    return res.status(400).json({ 
      error: "email and name must be strings" 
    });
  }

  if (!isValidEmail(email)) {
    return res.status(400).json({ 
      error: "Invalid email format" 
    });
  }

  if (name.length < 1 || name.length > 100) {
    return res.status(400).json({ 
      error: "name must be between 1 and 100 characters" 
    });
  }

  const user = await prisma.user.create({ 
    data: { email: email.toLowerCase().trim(), name: name.trim() } 
  });
  
  res.status(201).json(user);
}));

/**
 * GET /users/:id - Get single user by ID
 * Query params: ?includeNested=true
 */
app.get("/users/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const includeNested = req.query.includeNested === 'true';

  if (!isValidUUID(id)) {
    return res.status(400).json({ 
      error: "Invalid user ID format" 
    });
  }

  const user = await prisma.user.findUnique({
    where: { id },
    include: includeNested ? {
      projects: {
        include: {
          services: { include: { deployments: true } }
        }
      }
    } : undefined
  });

  if (!user) {
    return res.status(404).json({ 
      error: "User not found" 
    });
  }

  res.json(user);
}));

/**
 * PATCH /users/:id - Update user
 * Body: { email?: string, name?: string }
 */
app.patch("/users/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { email, name } = req.body;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: "Invalid user ID format" });
  }

  const updateData = {};
  
  if (email !== undefined) {
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    updateData.email = email.toLowerCase().trim();
  }

  if (name !== undefined) {
    if (name.length < 1 || name.length > 100) {
      return res.status(400).json({ error: "name must be between 1 and 100 characters" });
    }
    updateData.name = name.trim();
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  const user = await prisma.user.update({
    where: { id },
    data: updateData
  });

  res.json(user);
}));

/**
 * DELETE /users/:id - Delete user (cascades to projects, services, deployments)
 */
app.delete("/users/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: "Invalid user ID format" });
  }

  await prisma.user.delete({ where: { id } });

  res.status(204).send();
}));

// ====== Projects ======

/**
 * GET /projects - List all projects with pagination
 * Query params: ?page=1&limit=50&userId=xxx&includeNested=true
 */
app.get("/projects", asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const { userId } = req.query;
  const includeNested = req.query.includeNested === 'true';

  const where = userId ? { userId } : {};

  const [projects, total] = await Promise.all([
    prisma.project.findMany({
      where,
      take: limit,
      skip: skip,
      include: includeNested ? {
        services: { include: { deployments: true } }
      } : undefined,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.project.count({ where })
  ]);

  res.json({
    data: projects,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}));

/**
 * GET /projects/:id - Get single project
 */
app.get("/projects/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const includeNested = req.query.includeNested === 'true';

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: "Invalid project ID format" });
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: includeNested ? {
      services: { include: { deployments: true } }
    } : undefined
  });

  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  res.json(project);
}));

/**
 * POST /projects - Create project
 * Body: { name: string, userId: string }
 */
app.post("/projects", asyncHandler(async (req, res) => {
  const { name, userId } = req.body;

  // Validation
  if (!name || !userId) {
    return res.status(400).json({ 
      error: "name and userId are required" 
    });
  }

  if (typeof name !== 'string' || name.length < 1 || name.length > 200) {
    return res.status(400).json({ 
      error: "name must be between 1 and 200 characters" 
    });
  }

  if (!isValidUUID(userId)) {
    return res.status(400).json({ 
      error: "Invalid userId format" 
    });
  }

  const project = await prisma.project.create({ 
    data: { name: name.trim(), userId } 
  });

  res.status(201).json(project);
}));

/**
 * PATCH /projects/:id - Update project
 */
app.patch("/projects/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: "Invalid project ID format" });
  }

  if (!name || typeof name !== 'string' || name.length < 1 || name.length > 200) {
    return res.status(400).json({ error: "Valid name is required" });
  }

  const project = await prisma.project.update({
    where: { id },
    data: { name: name.trim() }
  });

  res.json(project);
}));

/**
 * DELETE /projects/:id - Delete project (cascades to services, deployments)
 */
app.delete("/projects/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: "Invalid project ID format" });
  }

  await prisma.project.delete({ where: { id } });

  res.status(204).send();
}));

// ====== Services ======

/**
 * GET /services - List all services with pagination
 * Query params: ?page=1&limit=50&projectId=xxx&includeDeployments=true
 */
app.get("/services", asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const { projectId } = req.query;
  const includeDeployments = req.query.includeDeployments === 'true';

  const where = projectId ? { projectId } : {};

  const [services, total] = await Promise.all([
    prisma.service.findMany({
      where,
      take: limit,
      skip: skip,
      include: includeDeployments ? { deployments: true } : undefined,
      orderBy: { createdAt: 'desc' }
    }),
    prisma.service.count({ where })
  ]);

  res.json({
    data: services,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}));

/**
 * GET /services/:id - Get single service
 */
app.get("/services/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const includeDeployments = req.query.includeDeployments === 'true';

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: "Invalid service ID format" });
  }

  const service = await prisma.service.findUnique({
    where: { id },
    include: includeDeployments ? { deployments: true } : undefined
  });

  if (!service) {
    return res.status(404).json({ error: "Service not found" });
  }

  res.json(service);
}));

/**
 * POST /services - Create service
 * Body: { name: string, type: string, projectId: string }
 */
app.post("/services", asyncHandler(async (req, res) => {
  const { name, type, projectId } = req.body;

  // Validation - FIXED: Now checks for type!
  if (!name || !type || !projectId) {
    return res.status(400).json({ 
      error: "name, type, and projectId are required" 
    });
  }

  if (typeof name !== 'string' || name.length < 1 || name.length > 200) {
    return res.status(400).json({ 
      error: "name must be between 1 and 200 characters" 
    });
  }

  if (typeof type !== 'string' || type.length < 1 || type.length > 50) {
    return res.status(400).json({ 
      error: "type must be between 1 and 50 characters" 
    });
  }

  if (!isValidUUID(projectId)) {
    return res.status(400).json({ 
      error: "Invalid projectId format" 
    });
  }

  const service = await prisma.service.create({ 
    data: { 
      name: name.trim(), 
      type: type.trim(), 
      projectId 
    } 
  });

  res.status(201).json(service);
}));

/**
 * PATCH /services/:id - Update service
 */
app.patch("/services/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, type } = req.body;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: "Invalid service ID format" });
  }

  const updateData = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.length < 1 || name.length > 200) {
      return res.status(400).json({ error: "Invalid name" });
    }
    updateData.name = name.trim();
  }

  if (type !== undefined) {
    if (typeof type !== 'string' || type.length < 1 || type.length > 50) {
      return res.status(400).json({ error: "Invalid type" });
    }
    updateData.type = type.trim();
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  const service = await prisma.service.update({
    where: { id },
    data: updateData
  });

  res.json(service);
}));

/**
 * DELETE /services/:id - Delete service (cascades to deployments)
 */
app.delete("/services/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: "Invalid service ID format" });
  }

  await prisma.service.delete({ where: { id } });

  res.status(204).send();
}));

// ====== Deployments ======

/**
 * GET /deployments - List all deployments with pagination
 * Query params: ?page=1&limit=50&serviceId=xxx&status=active
 */
app.get("/deployments", asyncHandler(async (req, res) => {
  const { page, limit, skip } = getPagination(req);
  const { serviceId, status } = req.query;

  const where = {};
  if (serviceId) where.serviceId = serviceId;
  if (status) where.status = status;

  const [deployments, total] = await Promise.all([
    prisma.deployment.findMany({
      where,
      take: limit,
      skip: skip,
      orderBy: { deployedAt: 'desc' }
    }),
    prisma.deployment.count({ where })
  ]);

  res.json({
    data: deployments,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}));

/**
 * GET /deployments/:id - Get single deployment
 */
app.get("/deployments/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: "Invalid deployment ID format" });
  }

  const deployment = await prisma.deployment.findUnique({ 
    where: { id },
    include: { service: true }
  });

  if (!deployment) {
    return res.status(404).json({ error: "Deployment not found" });
  }

  res.json(deployment);
}));

/**
 * POST /deployments - Create deployment
 * Body: { version: string, status: string, serviceId: string }
 */
app.post("/deployments", asyncHandler(async (req, res) => {
  const { version, status, serviceId } = req.body;

  // Validation - FIXED: Now checks for status!
  if (!version || !status || !serviceId) {
    return res.status(400).json({ 
      error: "version, status, and serviceId are required" 
    });
  }

  if (typeof version !== 'string' || version.length < 1 || version.length > 50) {
    return res.status(400).json({ 
      error: "version must be between 1 and 50 characters" 
    });
  }

  if (typeof status !== 'string' || status.length < 1 || status.length > 50) {
    return res.status(400).json({ 
      error: "status must be between 1 and 50 characters" 
    });
  }

  // Validate status enum (common values)
  const validStatuses = ['pending', 'deploying', 'active', 'failed', 'rolled_back'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      error: `status must be one of: ${validStatuses.join(', ')}` 
    });
  }

  if (!isValidUUID(serviceId)) {
    return res.status(400).json({ 
      error: "Invalid serviceId format" 
    });
  }

  const deployment = await prisma.deployment.create({ 
    data: { 
      version: version.trim(), 
      status, 
      serviceId 
    },
    include: { service: true }
  });

  res.status(201).json(deployment);
}));

/**
 * PATCH /deployments/:id - Update deployment (typically just status)
 */
app.patch("/deployments/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: "Invalid deployment ID format" });
  }

  if (!status) {
    return res.status(400).json({ error: "status is required" });
  }

  const validStatuses = ['pending', 'deploying', 'active', 'failed', 'rolled_back'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ 
      error: `status must be one of: ${validStatuses.join(', ')}` 
    });
  }

  const deployment = await prisma.deployment.update({
    where: { id },
    data: { status },
    include: { service: true }
  });

  res.json(deployment);
}));

/**
 * DELETE /deployments/:id - Delete deployment
 */
app.delete("/deployments/:id", asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!isValidUUID(id)) {
    return res.status(400).json({ error: "Invalid deployment ID format" });
  }

  await prisma.deployment.delete({ where: { id } });

  res.status(204).send();
}));

// ====== Health Check ======

app.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ====== Error Handling Middleware ======

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: "Route not found",
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((err, req, res, next) => {
  // Handle Prisma errors
  if (err.code && err.code.startsWith('P')) {
    return handlePrismaError(err, res);
  }

  // Log unexpected errors
  console.error('Unexpected error:', err);

  // Don't expose internal errors in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  
  res.status(500).json({ 
    error: "Internal server error",
    ...(isDevelopment && { details: err.message })
  });
});

// ====== Graceful Shutdown ======

async function shutdown(signal) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  
  try {
    await prisma.$disconnect();
    await pool.end();
    console.log('Database connections closed.');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ====== Start Server ======

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ SynchStack API running on http://localhost:${PORT}`);
  console.log(`📚 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🗄️  Database: Connected via Prisma`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  GET    /health`);
  console.log(`  GET    /users`);
  console.log(`  POST   /users`);
  console.log(`  GET    /users/:id`);
  console.log(`  PATCH  /users/:id`);
  console.log(`  DELETE /users/:id`);
  console.log(`  GET    /projects`);
  console.log(`  POST   /projects`);
  console.log(`  GET    /services`);
  console.log(`  POST   /services`);
  console.log(`  GET    /deployments`);
  console.log(`  POST   /deployments`);
});