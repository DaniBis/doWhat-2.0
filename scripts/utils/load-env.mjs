import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

const loadedFiles = new Set();

const defaultFiles = ['.env.local', '.env'];

export const loadEnv = (files = defaultFiles) => {
  for (const relativePath of files) {
    const fullPath = resolve(process.cwd(), relativePath);
    if (loadedFiles.has(fullPath)) continue;
    loadedFiles.add(fullPath);
    if (existsSync(fullPath)) {
      loadDotenv({ path: fullPath });
    }
  }
};

export default loadEnv;
