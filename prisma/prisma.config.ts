import { defineConfig } from '@prisma/extension-accelerate'

export default defineConfig({
  client: {
    adapter: {
      url: process.env.DATABASE_URL,  // <- points to your PostgreSQL
    },
  },
})
