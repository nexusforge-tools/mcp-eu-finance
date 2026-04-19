import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let _db: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_db) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
    _db = createClient(url, key, { auth: { persistSession: false } });
  }
  return _db;
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
    const db = getDb();
    const { data, error } = await db.rpc('verify_api_key', { p_key_hash: keyHash });
    if (error || !data || (data as unknown[]).length === 0) return null;

    const row = (data as Array<{
      api_key_id: string;
      rate_limit: number;
      user_id: string;
      email: string;
      plan: string;
    }>)[0];

    void db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', row.api_key_id);

    return {
      id: row.user_id,
      email: row.email,
      plan: row.plan ?? 'free',
      apiKeyId: row.api_key_id,
      rateLimit: row.rate_limit ?? 100,
    };
  } catch (err) {
    return null;
  }
}
