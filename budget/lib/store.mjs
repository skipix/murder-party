// Persistance dans un simple fichier JSON (data/db.json), écrit de façon atomique.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';

export const DEFAULT_CATEGORIES = [
  'Revenus', 'Logement', 'Courses', 'Restaurants', 'Transport', 'Santé',
  'Abonnements', 'Loisirs', 'Shopping', 'Voyages', 'Impôts & taxes',
  'Épargne', 'Virements internes', 'Retraits', 'Autre',
];

// Motifs (expressions régulières, insensibles à la casse) testés sur le libellé et la contrepartie.
export const DEFAULT_RULES = [
  { pattern: 'virement interne|vir interne|vir permanent', category: 'Virements internes' },
  { pattern: 'salaire|paie|payroll', category: 'Revenus' },
  { pattern: 'caf |allocation|remboursement|cpam', category: 'Revenus' },
  { pattern: 'loyer|edf|engie|eau |assurance hab|syndic', category: 'Logement' },
  { pattern: 'carrefour|leclerc|auchan|lidl|monoprix|franprix|intermarche|casino|picard|aldi|super u', category: 'Courses' },
  { pattern: 'restaurant|deliveroo|uber ?eats|mcdo|burger|boulangerie|cafe', category: 'Restaurants' },
  { pattern: 'sncf|ratp|navigo|uber|bolt|total ?energies|esso|shell|bp |peage|parking|blablacar', category: 'Transport' },
  { pattern: 'pharmacie|docteur|medecin|dentiste|mutuelle|doctolib', category: 'Santé' },
  { pattern: 'netflix|spotify|deezer|disney|canal|free mobile|orange|sfr|bouygues|amazon prime|icloud|google storage', category: 'Abonnements' },
  { pattern: 'fnac|cinema|ugc|pathe|steam|playstation|decathlon', category: 'Loisirs' },
  { pattern: 'amazon|zara|h&m|ikea|cdiscount|vinted', category: 'Shopping' },
  { pattern: 'airbnb|booking|hotel|air france|easyjet|ryanair', category: 'Voyages' },
  { pattern: 'dgfip|impot|taxe|urssaf', category: 'Impôts & taxes' },
  { pattern: 'livret|epargne|assurance vie|\\bpea\\b', category: 'Épargne' },
  { pattern: 'retrait|\\bdab\\b', category: 'Retraits' },
];

const empty = () => ({
  pending: {},            // state OAuth → banque en cours de connexion
  sessions: [],           // { id, aspsp, validUntil, createdAt }
  accounts: [],           // { uid, sessionId, name, iban, currency, bank, balance, lastSync }
  transactions: [],       // forme normalisée, cf. normalizeTransaction
  categories: DEFAULT_CATEGORIES,
  rules: DEFAULT_RULES,
  budgets: {},            // catégorie → plafond mensuel (€)
});

export class Store {
  constructor(file) {
    this.file = file;
    this.db = existsSync(file) ? { ...empty(), ...JSON.parse(readFileSync(file, 'utf8')) } : empty();
  }

  save() {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db, null, 2));
    renameSync(tmp, this.file);
  }

  // Remplace les transactions d'un compte à partir de dateFrom : les opérations « à venir »
  // (PDNG) changent souvent d'identifiant une fois comptabilisées, on les réécrit donc à chaque synchro.
  mergeTransactions(accountUid, dateFrom, fresh) {
    const manual = new Map(
      this.db.transactions.filter((t) => t.categoryManual).map((t) => [t.id, t.categoryManual]),
    );
    const known = new Set(this.db.transactions.map((t) => t.id));
    const byId = new Map();
    for (const t of this.db.transactions) {
      const stale = t.accountUid === accountUid && (t.status === 'PDNG' || t.date >= dateFrom);
      if (!stale) byId.set(t.id, t);
    }
    let added = 0;
    for (const t of fresh) {
      if (!known.has(t.id)) added++;
      if (manual.has(t.id)) t.categoryManual = manual.get(t.id);
      byId.set(t.id, t);
    }
    this.db.transactions = [...byId.values()].sort((a, b) => b.date.localeCompare(a.date));
    return added;
  }
}

export function normalizeTransaction(raw, accountUid) {
  const debit = raw.credit_debit_indicator === 'DBIT';
  const amount = Math.abs(Number(raw.transaction_amount?.amount ?? 0)) * (debit ? -1 : 1);
  const date = raw.booking_date ?? raw.value_date ?? raw.transaction_date ?? '';
  const counterparty = (debit ? raw.creditor?.name : raw.debtor?.name) ?? '';
  const label = [raw.remittance_information ?? []].flat().join(' ').trim()
    || raw.bank_transaction_code?.description || counterparty || '(sans libellé)';
  const ref = raw.entry_reference ?? raw.transaction_id
    ?? createHash('sha1').update(`${date}|${amount}|${label}|${raw.status}`).digest('hex').slice(0, 16);
  return {
    id: `${accountUid}:${ref}`,
    accountUid,
    date,
    amount: Math.round(amount * 100) / 100,
    currency: raw.transaction_amount?.currency ?? 'EUR',
    label,
    counterparty,
    status: raw.status ?? 'BOOK',
  };
}

const regexCache = new Map();
function compile(pattern) {
  if (!regexCache.has(pattern)) {
    let re = null;
    try { re = new RegExp(pattern, 'i'); } catch { /* motif invalide : ignoré */ }
    regexCache.set(pattern, re);
  }
  return regexCache.get(pattern);
}

export function categorize(t, rules) {
  if (t.categoryManual) return t.categoryManual;
  const haystack = `${t.label} ${t.counterparty}`;
  for (const { pattern, category } of rules) {
    if (compile(pattern)?.test(haystack)) return category;
  }
  return t.amount > 0 ? 'Revenus' : 'Autre';
}
