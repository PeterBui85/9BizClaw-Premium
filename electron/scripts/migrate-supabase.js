// Run Supabase SQL migration via management API
const https = require('https');

const SUPABASE_REF = 'ndssbmedzbjutnfznale';
const SUPABASE_HOST = `${SUPABASE_REF}.supabase.co`;
const SVC_TOKEN = process.env.SUPABASE_SERVICE_KEY;
if (!SVC_TOKEN) { console.error('Set SUPABASE_SERVICE_KEY env var'); process.exit(1); }

function httpsRequest(path, method, body, token) {
  return new Promise((resolve) => {
    const b = body ? JSON.stringify(body) : '';
    const opts = {
      hostname: SUPABASE_HOST,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'apikey': token,
        'Authorization': `Bearer ${token}`,
        ...(b ? { 'Content-Length': Buffer.byteLength(b) } : {}),
      },
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    req.on('error', e => resolve({ error: e.message }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ error: 'timeout' }); });
    if (b) req.write(b);
    req.end();
  });
}

// Try pg_net extension if available, otherwise direct table insert
async function createTables() {
  console.log('=== Testing Supabase connection ===\n');

  // Test 1: Can we query existing tables?
  const r1 = await httpsRequest('/rest/v1/?limit=1', 'GET', null, SVC_TOKEN);
  console.log('Connection test:', r1.status, r1.error || 'OK');

  const stmts = [
    // Table: licenses
    `CREATE TABLE IF NOT EXISTS public.licenses ( id uuid DEFAULT gen_random_uuid() PRIMARY KEY, key_hash text NOT NULL UNIQUE, payload jsonb NOT NULL, created_at timestamptz DEFAULT now() )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS licenses_key_hash_idx ON public.licenses(key_hash)`,
    // Table: activations
    `CREATE TABLE IF NOT EXISTS public.activations ( id uuid DEFAULT gen_random_uuid() PRIMARY KEY, key_hash text NOT NULL, machine_id text NOT NULL, email text, machine_name text, activated_at timestamptz DEFAULT now(), last_seen_at timestamptz DEFAULT now(), CONSTRAINT activations_key_hash_uniq UNIQUE (key_hash) )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS activations_key_hash_idx ON public.activations(key_hash)`,
    // Table: revoked_keys
    `CREATE TABLE IF NOT EXISTS public.revoked_keys ( id uuid DEFAULT gen_random_uuid() PRIMARY KEY, key_hash text NOT NULL UNIQUE, reason text, revoked_at timestamptz DEFAULT now() )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS revoked_keys_key_hash_idx ON public.revoked_keys(key_hash)`,
  ];

  // Try using management API to execute SQL
  for (const sql of stmts) {
    // Try via pg_execute if endpoint available
    const r = await httpsRequest('/rest/v1/rpc/pg_execute', 'POST', { sql }, SVC_TOKEN);
    if (r.status === 404 || r.error) {
      // Fallback: try direct insert approach (tables might need manual creation)
      console.log('RPC not available, trying direct approach for:', sql.slice(0, 50));
    }
    console.log(`Status ${r.status} | ${sql.slice(0, 60)}`);
    if (r.status >= 400) console.log('  Response:', r.body.slice(0, 200));
  }
}

createTables().catch(console.error);
