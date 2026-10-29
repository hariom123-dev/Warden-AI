import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';

// Resolve possible .env paths across root and backend directory using cross-platform path resolution
const candidateEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '..', '.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../../../.env'),
];

let loadedEnvPath: string | null = null;
for (const envPath of candidateEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    loadedEnvPath = envPath;
    break;
  }
}

/**
 * Zod schema for environment variables
 */
export const EnvSchema = z.object({
  PORT: z
    .string()
    .default('3001')
    .transform((val) => {
      const parsed = parseInt(val, 10);
      return parsed;
    })
    .refine((val) => !isNaN(val) && val > 0 && val <= 65535, {
      message: 'PORT must be a valid port number between 1 and 65535',
    }),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  DB_PATH: z
    .string()
    .default(path.resolve(__dirname, '../../audit.db'))
    .transform((val) => path.resolve(val)),
  CORS_ORIGIN: z
    .string()
    .default('*'),
  HONEYPOT_ENABLED: z
    .string()
    .default('true')
    .transform((val) => val === 'true' || val === '1'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Validates environment variables and provides clear, human-readable errors on failure.
 */
export function validateEnv(exitOnError = true): { success: boolean; config?: EnvConfig; errors?: string[] } {
  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errorMessages = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`
    );

    console.error('\x1b[31m[Warden-AI] ❌ Environment configuration validation failed:\x1b[0m');
    errorMessages.forEach((msg) => {
      console.error(`  - \x1b[33m${msg}\x1b[0m`);
    });
    console.error('\n\x1b[36mRemediation:\x1b[0m');
    console.error('  1. Check your .env file or create one from the template:');
    console.error('     cp .env.example .env');
    console.error('  2. Review required values and re-run the application.\n');

    if (exitOnError) {
      process.exit(1);
    }

    return { success: false, errors: errorMessages };
  }

  return { success: true, config: result.data };
}

// Perform validation on startup
const validated = validateEnv(true);
export const env: EnvConfig = validated.config!;
export const envLoadedFrom = loadedEnvPath;
