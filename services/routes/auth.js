require("dotenv").config();

const express = require("express");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const prisma = new PrismaClient();

app.use(express.json());

const SECRET = process.env.JWT_SECRET || "dev_secret";


// REGISTER
app.post("/auth/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // basic validation
    if (!email || !password || !name) {
      return res.status(400).json({ error: "Missing fields" });
    }

    // hash password
    const hash = await bcrypt.hash(password, 10);

    // create user
    const user = await prisma.user.create({
      data: {
        email,
        name,
        passwordHash: hash,
      },
    });

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: "User already exists or failed" });
  }
});


// LOGIN
app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // create token
    const token = jwt.sign(
      { userId: user.id },
      SECRET,
      { expiresIn: "1d" }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: "Login failed" });
  }
});


// AUTH MIDDLEWARE
const authMiddleware = (req, res, next) => {
  const header = req.headers.authorization;

  if (!header) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, SECRET);
    req.user = decoded; // { userId }
    next();
  } catch (err) {
    res.status(401).json({ error: "Invalid token" });
  }
};


// GET CURRENT USER
app.get("/auth/me", authMiddleware, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch user" });
  }
});


// LOGOUT (JWT = client-side)

app.post("/auth/logout", (req, res) => {
  res.json({ message: "Logged out (client should delete token)" });
});


app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});