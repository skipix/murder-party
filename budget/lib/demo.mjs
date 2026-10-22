// Données fictives au format de l'API Enable Banking, pour essayer l'outil sans banque.
import { normalizeTransaction } from './store.mjs';

const MONTHLY = [
  { day: 1, amount: 2850, dir: 'CRDT', who: 'ACME SAS', text: 'VIR SALAIRE ACME SAS' },
  { day: 3, amount: 890, dir: 'DBIT', who: 'SCI DES LILAS', text: 'PRLV LOYER SCI DES LILAS' },
  { day: 5, amount: 62.4, dir: 'DBIT', who: 'EDF', text: 'PRLV EDF CLIENTS PARTICULIERS' },
  { day: 8, amount: 13.49, dir: 'DBIT', who: 'NETFLIX', text: 'CB NETFLIX.COM' },
  { day: 8, amount: 10.99, dir: 'DBIT', who: 'SPOTIFY', text: 'CB SPOTIFY P2F1' },
  { day: 10, amount: 19.99, dir: 'DBIT', who: 'FREE MOBILE', text: 'PRLV FREE MOBILE' },
  { day: 12, amount: 86.4, dir: 'DBIT', who: 'RATP', text: 'PRLV NAVIGO ANNUEL' },
  { day: 15, amount: 300, dir: 'DBIT', who: 'LIVRET A', text: 'VIR EPARGNE LIVRET A' },
];

const RANDOM = [
  { who: 'CARREFOUR CITY', min: 8, max: 45, perMonth: 6 },
  { who: 'LIDL', min: 25, max: 90, perMonth: 3 },
  { who: 'MONOPRIX', min: 6, max: 35, perMonth: 3 },
  { who: 'BOULANGERIE PAUL', min: 2, max: 12, perMonth: 5 },
  { who: 'DELIVEROO', min: 18, max: 42, perMonth: 2 },
  { who: 'RESTAURANT LE PETIT ZINC', min: 22, max: 75, perMonth: 2 },
  { who: 'UBER', min: 9, max: 28, perMonth: 1 },
  { who: 'TOTALENERGIES', min: 40, max: 75, perMonth: 1 },
  { who: 'PHARMACIE DU MARCHE', min: 5, max: 30, perMonth: 1 },
  { who: 'AMAZON EU', min: 12, max: 120, perMonth: 2 },
  { who: 'FNAC', min: 15, max: 60, perMonth: 0.6 },
  { who: 'UGC CINE CITE', min: 11, max: 24, perMonth: 1 },
  { who: 'RETRAIT DAB BNP', min: 20, max: 60, perMonth: 1 },
  { who: 'ZARA', min: 25, max: 90, perMonth: 0.5 },
  { who: 'SNCF CONNECT', min: 30, max: 140, perMonth: 0.5 },
];

// Générateur pseudo-aléatoire déterministe : la démo est identique à chaque lancement.
function rng(seed) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

const iso = (d) => d.toISOString().slice(0, 10);

export function demoData(today = new Date()) {
  const rand = rng(42);
  const accounts = [
    { uid: 'demo-courant', sessionId: 'demo', name: 'Compte courant', iban: 'FR76 3000 4000 0100 0012 3456 789', currency: 'EUR', bank: 'Banque Démo' },
    { uid: 'demo-joint', sessionId: 'demo', name: 'Compte joint', iban: 'FR76 3000 4000 0200 0098 7654 321', currency: 'EUR', bank: 'Banque Démo' },
  ];
  const raws = [];
  let n = 0;
  const push = (accountUid, date, amount, dir, who, text) => {
    if (date > today) return;
    const pending = (today - date) / 86400000 < 2;
    raws.push([accountUid, {
      entry_reference: `demo-${n++}`,
      transaction_amount: { amount: amount.toFixed(2), currency: 'EUR' },
      credit_debit_indicator: dir,
      status: pending ? 'PDNG' : 'BOOK',
      booking_date: iso(date),
      [dir === 'DBIT' ? 'creditor' : 'debtor']: { name: who },
      remittance_information: [text],
    }]);
  };

  for (let m = 11; m >= 0; m--) {
    const month = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - m, 1));
    const daysInMonth = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
    const day = (d) => new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), d));

    for (const f of MONTHLY) push('demo-courant', day(f.day), f.amount, f.dir, f.who, f.text);
    push('demo-joint', day(2), 600, 'CRDT', 'MOI', 'VIR PERMANENT COMPTE JOINT');
    for (const r of RANDOM) {
      const count = Math.floor(r.perMonth + rand());
      for (let i = 0; i < count; i++) {
        const amount = r.min + rand() * (r.max - r.min);
        const account = rand() < 0.35 ? 'demo-joint' : 'demo-courant';
        push(account, day(1 + Math.floor(rand() * daysInMonth)), amount, 'DBIT', r.who, `CB ${r.who}`);
      }
    }
    if (m % 4 === 1) push('demo-courant', day(20), 420 + rand() * 400, 'DBIT', 'AIRBNB', 'CB AIRBNB * HMXYZ');
    if (m === 2) push('demo-courant', day(15), 1240, 'DBIT', 'DGFIP', 'PRLV IMPOT REVENUS DGFIP');
    if (m === 6) push('demo-courant', day(25), 1500, 'CRDT', 'ACME SAS', 'VIR PRIME ANNUELLE ACME');
  }

  const transactions = raws
    .map(([uid, raw]) => normalizeTransaction(raw, uid))
    .sort((a, b) => b.date.localeCompare(a.date));
  for (const a of accounts) {
    const sum = transactions.filter((t) => t.accountUid === a.uid).reduce((s, t) => s + t.amount, 0);
    a.balance = Math.round(((a.uid === 'demo-courant' ? 1800 : 400) + sum) * 100) / 100;
    a.lastSync = new Date().toISOString();
  }
  return { accounts, transactions };
}
