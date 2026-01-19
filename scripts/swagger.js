const express = require("express");
const swaggerUi = require("swagger-ui-express");
const YAML = require("yamljs");

const app = express();

// Load your OpenAPI contract
const swaggerDocument = YAML.load(
  "./contracts/users/v1/openapi.yaml"
);

// Serve Swagger UI at /docs
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

const PORT = 4000;
app.listen(PORT, () => {
  console.log(`Swagger UI running at http://localhost:${PORT}/docs`);
});
