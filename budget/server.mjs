// Serveur local : parle à Enable Banking (la clé privée ne quitte jamais cette machine),
// stocke les transactions dans data/ et sert l'interface sur http://localhost:<port>.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { EnableBanking } from './lib/enablebanking.mjs';
import { Store, normalizeTransaction, categorize } from './lib/store.mjs';
import { demoData } from './lib/demo.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const DEMO = process.argv.includes('--demo');

const configPath = join(ROOT, 'config.json');
const config = {
  port: 3000,
  country: 'FR',
  historyDays: 365,
  ...(existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : {}),
};
if (process.env.PORT) config.port = Number(process.env.PORT);

let bank = null;
if (!DEMO && config.applicationId && config.privateKeyPath) {
  bank = new EnableBanking({
    applicationId: config.applicationId,
    privateKey: readFileSync(resolve(ROOT, config.privateKeyPath), 'utf8'),
    apiOrigin: config.apiOrigin,
  });
}

const store = new Store(join(ROOT, 'data', DEMO ? 'demo.json' : 'db.json'));
if (DEMO && store.db.transactions.length === 0) {
  Object.assign(store.db, demoData());
  store.db.budgets = { Courses: 450, Restaurants: 200, Transport: 180, Shopping: 150, Loisirs: 80 };
  store.save();
}

const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function requireBank() {
  if (!bank) throw new HttpError(400, 'Enable Banking n’est pas configuré (config.json manquant ou mode démo).');
  return bank;
}

async function finishAuth(code, state) {
  const pending = store.db.pending[state];
  if (!pending) throw new HttpError(400, 'Connexion inconnue ou expirée, recommence depuis « Connecter une banque ».');
  delete store.db.pending[state];
  const session = await requireBank().createSession(code);
  store.db.sessions.push({
    id: session.session_id,
    aspsp: session.aspsp ?? pending.aspsp,
    validUntil: session.access?.valid_until ?? pending.validUntil,
    createdAt: new Date().toISOString(),
  });
  for (const acc of session.accounts ?? []) {
    const existing = store.db.accounts.find((a) => a.uid === acc.uid);
    const account = {
      uid: acc.uid,
      sessionId: session.session_id,
      name: acc.name ?? acc.product ?? acc.details ?? 'Compte',
      iban: acc.account_id?.iban ?? acc.account_id?.other?.identification ?? '',
      currency: acc.currency ?? 'EUR',
      bank: pending.aspsp.name,
      balance: existing?.balance ?? null,
      lastSync: existing?.lastSync ?? null,
    };
    if (existing) Object.assign(existing, account);
    else store.db.accounts.push(account);
  }
  store.save();
  return session.accounts?.length ?? 0;
}

const BALANCE_PREFERENCE = ['CLBD', 'ITAV', 'XPCD', 'ITBD', 'CLAV', 'OPBD'];

async function syncAccount(account) {
  const api = requireBank();
  const dateFrom = account.lastSync
    ? daysAgo(Math.ceil((Date.now() - Date.parse(account.lastSync)) / 86400000) + 7)
    : daysAgo(config.historyDays);
  const raws = await api.transactions(account.uid, dateFrom);
  const added = store.mergeTransactions(account.uid, dateFrom, raws.map((r) => normalizeTransaction(r, account.uid)));
  try {
    const { balances = [] } = await api.balances(account.uid);
    const best = BALANCE_PREFERENCE.map((t) => balances.find((b) => b.balance_type === t)).find(Boolean) ?? balances[0];
    if (best) account.balance = Number(best.balance_amount.amount);
  } catch (err) {
    console.warn(`Solde indisponible pour ${account.name} : ${err.message}`);
  }
  account.lastSync = new Date().toISOString();
  return added;
}

function snapshot() {
  const { accounts, transactions, categories, rules, budgets, sessions } = store.db;
  return {
    mode: DEMO ? 'demo' : bank ? 'live' : 'unconfigured',
    country: config.country,
    accounts,
    sessions: sessions.map(({ id, aspsp, validUntil }) => ({ id, bank: aspsp?.name, validUntil })),
    transactions: transactions.map((t) => ({ ...t, category: categorize(t, rules) })),
    categories: [...new Set([...categories, ...rules.map((r) => r.category)])],
    rules,
    budgets,
  };
}

const routes = {
  'GET /api/data': () => snapshot(),

  'GET /api/banks': async (_req, url) => requireBank().listBanks(url.searchParams.get('country') ?? config.country),

  'POST /api/connect': async (req) => {
    const { name, country, maximumConsentValidity } = await req.json();
    const seconds = Math.min(maximumConsentValidity ?? 90 * 86400, 180 * 86400);
    const validUntil = new Date(Date.now() + seconds * 1000).toISOString();
    const state = randomUUID();
    const aspsp = { name, country };
    const { url } = await requireBank().startAuth({ aspsp, redirectUrl: config.redirectUrl, state, validUntil });
    store.db.pending[state] = { aspsp, validUntil };
    store.save();
    return { url };
  },

  // Repli quand la redirection ne peut pas viser localhost : on colle l'URL de retour à la main.
  'POST /api/callback': async (req) => {
    const { url } = await req.json();
    const params = new URL(url, 'http://x').searchParams;
    if (params.get('error')) throw new HttpError(400, params.get('error_description') ?? params.get('error'));
    return { accounts: await finishAuth(params.get('code'), params.get('state')) };
  },

  'POST /api/sync': async () => {
    const results = [];
    for (const account of store.db.accounts) {
      try {
        results.push({ account: account.name, added: await syncAccount(account) });
      } catch (err) {
        results.push({ account: account.name, error: err.message });
      }
    }
    store.save();
    return { results };
  },

  'PUT /api/transaction': async (req) => {
    const { id, category } = await req.json();
    const t = store.db.transactions.find((x) => x.id === id);
    if (!t) throw new HttpError(404, 'Transaction introuvable');
    if (category) t.categoryManual = category;
    else delete t.categoryManual;
    store.save();
    return snapshot();
  },

  'PUT /api/settings': async (req) => {
    const { categories, rules, budgets } = await req.json();
    if (categories) store.db.categories = categories;
    if (rules) store.db.rules = rules;
    if (budgets) store.db.budgets = budgets;
    store.save();
    return snapshot();
  },

  'DELETE /api/account': async (_req, url) => {
    const uid = url.searchParams.get('uid');
    store.db.accounts = store.db.accounts.filter((a) => a.uid !== uid);
    store.db.transactions = store.db.transactions.filter((t) => t.accountUid !== uid);
    store.save();
    return snapshot();
  },
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };

async function serveStatic(res, pathname) {
  const file = resolve(PUBLIC, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!file.startsWith(PUBLIC)) throw new HttpError(403, 'Interdit');
  const body = await readFile(file).catch(() => { throw new HttpError(404, 'Introuvable'); });
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream' });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  req.json = async () => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    return raw ? JSON.parse(raw) : {};
  };
  try {
    if (req.method === 'GET' && url.pathname === '/callback') {
      const error = url.searchParams.get('error');
      if (error) throw new HttpError(400, url.searchParams.get('error_description') ?? error);
      const count = await finishAuth(url.searchParams.get('code'), url.searchParams.get('state'));
      res.writeHead(302, { Location: `/?connected=${count}` });
      return res.end();
    }
    const handler = routes[`${req.method} ${url.pathname}`];
    if (handler) {
      const data = await handler(req, url);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(data));
    }
    if (req.method === 'GET') return await serveStatic(res, url.pathname);
    throw new HttpError(404, 'Introuvable');
  } catch (err) {
    const status = err.status ?? 502;
    if (status >= 500) console.error(err);
    if (url.pathname === '/callback') {
      res.writeHead(302, { Location: `/?error=${encodeURIComponent(err.message)}` });
      return res.end();
    }
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
});

// Écoute uniquement en local : ces données ne doivent pas être exposées sur le réseau.
server.listen(config.port, '127.0.0.1', () => {
  const mode = DEMO ? ' (mode démo)' : bank ? '' : ' (non configuré : voir README)';
  console.log(`Budget prêt sur http://localhost:${config.port}${mode}`);
});
