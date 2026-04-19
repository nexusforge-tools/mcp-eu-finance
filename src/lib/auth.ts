import { createHash } from 'node:crypto';
import pkg from 'pg';
const { Pool } = pkg;

let _pool: pkg.Pool | null = null;
function getPool(): pkg.Pool {
  if (!_pool) {
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return _pool;
}

export interface AuthUser {
  id: string;
  email: string;
  plan: string;
  apiKeyId: string;
  rateLimit: number;
}

export async function verifyApiKey(apiKey: string | undefined): Promise<AuthUser | null> {
  if (!apiKey || apiKey.length < 32) return null;

  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  try {
    const result = await getPool().query(
      'SELECT * FROM verify_api_key($1)',
      [keyHash]
    );
    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      id: row.user_id,
      email: row.email,
      plan: row.plan ?? 'free',
      apiKeyId: row.api_key_id,
      rateLimit: row.rate_limit ?? 100,
    };
  } catch (err) {
    console.error('verifyApiKey error:', String(err));
    return null;
  }
}
