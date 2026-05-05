#!/usr/bin/env node
import 'dotenv/config';
import { V8Client, type V8Record } from './v8-client.js';

function readEnv(key: string, fallback?: string): string {
  const val = process.env[key];
  if (val !== undefined && val !== '') return val;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required env var: ${key}`);
}

function normalize(value: unknown): string {
  if (!value) return '';
  return String(value)
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ');
}

type ModuleName = 'Accounts' | 'Contacts' | 'AOS_Products' | 'AOS_Quotes' | 'AOS_Invoices';

interface ModuleConfig {
  fields: string[];
  businessKey: (r: V8Record) => string;
}

const MODULE_CONFIGS: Record<ModuleName, ModuleConfig> = {
  Accounts: {
    fields: ['name', 'billing_address_city', 'external_id_c'],
    businessKey: (r) => {
      const a = r.attributes;
      return normalize(a['name']) + '|' + normalize(a['billing_address_city']);
    },
  },
  Contacts: {
    fields: ['first_name', 'last_name', 'email1', 'external_id_c'],
    businessKey: (r) => {
      const a = r.attributes;
      return normalize(a['first_name']) + '|' + normalize(a['last_name']) + '|' + normalize(a['email1']);
    },
  },
  AOS_Products: {
    fields: ['name', 'part_number', 'external_id_c'],
    businessKey: (r) => {
      const a = r.attributes;
      const key = a['part_number'] ? normalize(a['part_number']) : normalize(a['name']);
      return key;
    },
  },
  AOS_Quotes: {
    fields: ['name', 'number', 'external_id_c'],
    businessKey: (r) => {
      const a = r.attributes;
      const key = a['number'] ? normalize(a['number']) : normalize(a['name']);
      return key;
    },
  },
  AOS_Invoices: {
    fields: ['name', 'number', 'external_id_c'],
    businessKey: (r) => {
      const a = r.attributes;
      const key = a['number'] ? normalize(a['number']) : normalize(a['name']);
      return key;
    },
  },
};

interface ModuleStats {
  module: string;
  totalFirmas: number;
  totalSaci: number;
  matched: number;
  ambiguous: number;
  onlyFirmas: number;
  onlySaci: number;
  errors: number;
}

async function reconcileModule(
  module: ModuleName,
  firmasClient: V8Client,
  saciClient: V8Client,
  dryRun: boolean,
): Promise<ModuleStats> {
  const cfg = MODULE_CONFIGS[module];
  console.log(`\n[${module}] Fetching records...`);

  const [firmasRecords, saciRecords] = await Promise.all([
    firmasClient.fetchAll(module, cfg.fields),
    saciClient.fetchAll(module, cfg.fields),
  ]);

  console.log(`[${module}] firmas=${firmasRecords.length}, saci=${saciRecords.length}`);

  const saciIndex = new Map<string, V8Record[]>();
  for (const r of saciRecords) {
    const key = cfg.businessKey(r);
    if (!key || key === '|' || key === '||') continue;
    const existing = saciIndex.get(key) ?? [];
    existing.push(r);
    saciIndex.set(key, existing);
  }

  let matched = 0;
  let ambiguous = 0;
  let onlyFirmas = 0;
  let errors = 0;
  const matchedSaciIds = new Set<string>();

  for (const firmasRec of firmasRecords) {
    const key = cfg.businessKey(firmasRec);
    if (!key || key === '|' || key === '||') {
      onlyFirmas++;
      continue;
    }

    const candidates = saciIndex.get(key) ?? [];

    if (candidates.length === 0) {
      onlyFirmas++;
      continue;
    }

    if (candidates.length > 1) {
      console.warn(`[${module}] Ambiguous match for key "${key}" (${candidates.length} candidates) — skipping`);
      ambiguous++;
      continue;
    }

    const saciRec = candidates[0]!;
    matchedSaciIds.add(saciRec.id);
    matched++;

    if (dryRun) {
      console.log(`[${module}] [DRY-RUN] Would link firmas:${firmasRec.id} <-> saci:${saciRec.id}`);
      continue;
    }

    try {
      await Promise.all([
        firmasClient.patch(module, firmasRec.id, { external_id_c: saciRec.id }),
        saciClient.patch(module, saciRec.id, { external_id_c: firmasRec.id }),
      ]);
      console.log(`[${module}] Linked firmas:${firmasRec.id} <-> saci:${saciRec.id}`);
    } catch (err) {
      console.error(`[${module}] Error linking firmas:${firmasRec.id} <-> saci:${saciRec.id}:`, err instanceof Error ? err.message : err);
      errors++;
      matched--;
    }
  }

  const onlySaci = saciRecords.filter((r) => !matchedSaciIds.has(r.id)).length;

  return {
    module,
    totalFirmas: firmasRecords.length,
    totalSaci: saciRecords.length,
    matched,
    ambiguous,
    onlyFirmas,
    onlySaci,
    errors,
  };
}

function printReport(stats: ModuleStats[]): void {
  console.log('\n=== Reconciliation Report ===');
  for (const s of stats) {
    console.log(`\nModule: ${s.module}`);
    console.log(`  Firmas: ${s.totalFirmas} | SaciERP: ${s.totalSaci} | Matched: ${s.matched} | Ambiguous: ${s.ambiguous} | Only-Firmas: ${s.onlyFirmas} | Only-SaciERP: ${s.onlySaci}${s.errors > 0 ? ` | Errors: ${s.errors}` : ''}`);
  }
  console.log('\n=============================');
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const moduleIdx = args.indexOf('--module');
  const moduleFilter = moduleIdx !== -1 ? args[moduleIdx + 1] : undefined;

  const allModules: ModuleName[] = ['Accounts', 'Contacts', 'AOS_Products', 'AOS_Quotes', 'AOS_Invoices'];
  const modules: ModuleName[] = moduleFilter
    ? allModules.filter((m) => m === moduleFilter)
    : allModules;

  if (moduleFilter && modules.length === 0) {
    console.error(`Unknown module: ${moduleFilter}. Valid modules: ${allModules.join(', ')}`);
    process.exit(1);
  }

  if (dryRun) {
    console.log('[DRY-RUN] No changes will be written.');
  }

  const firmasClient = new V8Client({
    baseUrl: readEnv('SUITECRM_BASE_URL', 'https://firmas.moacrm.com') + '/legacy/Api/V8',
    tokenUrl: readEnv('SUITECRM_BASE_URL', 'https://firmas.moacrm.com') + '/legacy/Api/access_token',
    clientId: readEnv('SUITECRM_OAUTH_CLIENT_ID'),
    clientSecret: readEnv('SUITECRM_OAUTH_CLIENT_SECRET'),
  });

  const saciClient = new V8Client({
    baseUrl: readEnv('SACIERP_API_BASE_URL', 'https://sacierp.moacrm.com/legacy/Api/V8'),
    tokenUrl: readEnv('SACIERP_API_TOKEN_URL', 'https://sacierp.moacrm.com/legacy/Api/access_token'),
    clientId: readEnv('SACIERP_BRIDGE_CLIENT_ID'),
    clientSecret: readEnv('SACIERP_BRIDGE_CLIENT_SECRET'),
  });

  const stats: ModuleStats[] = [];

  for (const module of modules) {
    try {
      const result = await reconcileModule(module, firmasClient, saciClient, dryRun);
      stats.push(result);
    } catch (err) {
      console.error(`[${module}] Fatal error:`, err instanceof Error ? err.message : err);
      stats.push({
        module,
        totalFirmas: 0,
        totalSaci: 0,
        matched: 0,
        ambiguous: 0,
        onlyFirmas: 0,
        onlySaci: 0,
        errors: 1,
      });
    }
  }

  printReport(stats);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.message : err);
  process.exit(1);
});
