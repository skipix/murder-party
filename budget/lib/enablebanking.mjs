// Client minimal pour l'API Enable Banking (https://enablebanking.com/docs/api/reference/).
// Chaque requête est authentifiée par un JWT RS256 signé avec la clé privée de l'application.
import { sign } from 'node:crypto';

export class EnableBanking {
  constructor({ applicationId, privateKey, apiOrigin = 'https://api.enablebanking.com' }) {
    this.applicationId = applicationId;
    this.privateKey = privateKey;
    this.apiOrigin = apiOrigin;
  }

  jwt() {
    const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
    const iat = Math.floor(Date.now() / 1000);
    const header = b64({ typ: 'JWT', alg: 'RS256', kid: this.applicationId });
    const body = b64({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 });
    const signature = sign('RSA-SHA256', Buffer.from(`${header}.${body}`), this.privateKey).toString('base64url');
    return `${header}.${body}.${signature}`;
  }

  async request(method, path, { query, body } = {}) {
    const url = new URL(path, this.apiOrigin);
    for (const [k, v] of Object.entries(query ?? {})) if (v != null) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.jwt()}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const detail = data?.message ?? data?.error ?? text;
      throw new Error(`Enable Banking ${method} ${url.pathname} → ${res.status} ${detail}`);
    }
    return data;
  }

  listBanks(country) {
    return this.request('GET', '/aspsps', { query: { country, psu_type: 'personal' } });
  }

  startAuth({ aspsp, redirectUrl, state, validUntil }) {
    return this.request('POST', '/auth', {
      body: {
        access: { valid_until: validUntil },
        aspsp,
        state,
        redirect_url: redirectUrl,
        psu_type: 'personal',
      },
    });
  }

  createSession(code) {
    return this.request('POST', '/sessions', { body: { code } });
  }

  balances(accountUid) {
    return this.request('GET', `/accounts/${accountUid}/balances`);
  }

  // Parcourt toutes les pages (continuation_key) à partir de dateFrom.
  async transactions(accountUid, dateFrom) {
    const all = [];
    let continuationKey;
    do {
      const page = await this.request('GET', `/accounts/${accountUid}/transactions`, {
        query: { date_from: dateFrom, continuation_key: continuationKey },
      });
      all.push(...(page.transactions ?? []));
      continuationKey = page.continuation_key;
    } while (continuationKey);
    return all;
  }
}
