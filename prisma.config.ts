import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// .env.local이 없는 환경(Vercel 등)에서는 이미 process.env에 있으므로 무시
config({ path: ".env.local", override: false });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
