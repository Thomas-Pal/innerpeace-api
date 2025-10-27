import { config as loadEnvFile } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

function loadFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  loadEnvFile({ path: filePath, override: true });
  return true;
}

const cwd = process.cwd();
const nodeEnv = process.env.NODE_ENV || 'development';
const candidates = [
  '.env',
  `.env.${nodeEnv}`,
  '.env.local',
  `.env.${nodeEnv}.local`,
];

const loaded: string[] = [];

for (const candidate of candidates) {
  const fullPath = path.resolve(cwd, candidate);
  if (loadFile(fullPath)) {
    loaded.push(candidate);
  }
}

if (loaded.length && process.env.NODE_ENV !== 'production') {
  console.log(`[env] loaded ${loaded.join(', ')}`);
}
