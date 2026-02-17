const express = require("express");
const YAML = require("yamljs");
const swaggerUi = require("swagger-ui-express");
const path = require("path");

const app = express();
app.use(express.json());

const apiSpec = YAML.load(path.resolve(__dirname, "../../../contracts/users/v1/openapi.yaml"));

app.get('/health', (req, res) => res.send('OK'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(apiSpec));

let users = [
  { id: "usr_1", email: "toni@example.com", name: "Toni", createdAt: new Date().toISOString() },
  { id: "usr_2", email: "joy@example.com", name: "Joy", createdAt: new Date().toISOString() }
];

app.get("/users", (req, res) => res.json(users));

app.post("/users", (req, res) => {
  const { email, name } = req.body;
  if (!email || !name) return res.status(400).json({ error: "email and name required" });
  
  const newUser = {
    id: `usr_${users.length + 1}`,
    email,
    name,
    createdAt: new Date().toISOString()
  };
  users.push(newUser);
  res.status(201).json(newUser);
});

app.get("/users/:id", (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json(user);
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message });
});

app.listen(3001, () => console.log('Server running on :3001'));