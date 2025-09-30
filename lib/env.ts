// lib/env.ts
import { z } from "zod";

const envSchema = z.object({
  // Database
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  MONGODB_DB: z.string().default("mos-maintenance-mvp"),
  
  // Authentication
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  
  // Email (optional for development)
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FROM_EMAIL: z.string().email().optional(),
  
  // Admin
  ADMIN_TOKEN: z.string().min(1, "ADMIN_TOKEN is required"),
  
  // External APIs
  OPENAI_API_KEY: z.string().optional(),
  
  // AutoFlow (optional)
  AUTOFLOW_BASE_URL: z.string().url().optional(),
  AUTOFLOW_API_KEY: z.string().optional(),
  AUTOFLOW_API_PASSWORD: z.string().optional(),
  
  // Carfax (optional)
  CARFAX_API_KEY: z.string().optional(),
  CARFAX_BASE_URL: z.string().url().optional(),
  
  // App config
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  
  // DataOne (optional)
  DATAONE_SFTP_HOST: z.string().optional(),
  DATAONE_SFTP_PORT: z.string().optional(),
  DATAONE_SFTP_USER: z.string().optional(),
  DATAONE_SFTP_PASS: z.string().optional(),
});

type Env = z.infer<typeof envSchema>;

let env: Env;

export function validateEnv(): Env {
  if (env) return env;
  
  try {
    env = envSchema.parse(process.env);
    return env;
  } catch (error) {
    console.error("❌ Environment validation failed:");
    if (error instanceof z.ZodError) {
      error.errors.forEach((err) => {
        console.error(`  ${err.path.join(".")}: ${err.message}`);
      });
    }
    process.exit(1);
  }
}

// Validate environment on import
export const ENV = validateEnv();

// Helper to check if email is configured
export function isEmailConfigured(): boolean {
  return !!(ENV.SMTP_HOST && ENV.SMTP_USER && ENV.SMTP_PASS && ENV.FROM_EMAIL);
}

// Helper to check if AI features are available
export function isAIConfigured(): boolean {
  return !!ENV.OPENAI_API_KEY;
}

// Helper to check if AutoFlow is configured
export function isAutoflowConfigured(): boolean {
  return !!(ENV.AUTOFLOW_BASE_URL && ENV.AUTOFLOW_API_KEY && ENV.AUTOFLOW_API_PASSWORD);
}

// Helper to check if Carfax is configured
export function isCarfaxConfigured(): boolean {
  return !!(ENV.CARFAX_API_KEY && ENV.CARFAX_BASE_URL);
}