type Query = {sql: string; params: unknown[]};
type Result = {success: boolean; results?: Record<string, unknown>[]; meta?: Record<string, unknown>};
type Config = {accountId: string; databaseId: string; token: string};

/** Preserve prepared parameters and send writes together using D1's batch API. */
export function createD1Http(config: Config, fetcher: typeof fetch = fetch): D1Database {
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/d1/database/${encodeURIComponent(config.databaseId)}/query`;
  async function query(queries: Query[], batch = false): Promise<D1Result[]> {
    const response = await fetcher(endpoint, {
      method: 'POST', headers: {'Content-Type': 'application/json', Authorization: `Bearer ${config.token}`},
      body: JSON.stringify(batch ? {batch: queries} : queries[0]),
      cache: 'no-store', signal: AbortSignal.timeout(25000),
    });
    // Never surface the remote response, credentials or SQL through a public error.
    if (!response.ok) throw new Error(`D1 HTTP request failed (${response.status})`);
    const body = await response.json() as {success?: boolean; result?: Result[]};
    if (body.success !== true || !Array.isArray(body.result) || !body.result.length || body.result.some(row => row.success !== true))
      throw new Error('D1 HTTP query failed');
    return body.result.map(row => ({success: true, results: row.results || [], meta: row.meta || {}})) as D1Result[];
  }
  class Statement {
    constructor(readonly sql: string, readonly params: unknown[] = []) {}
    bind(...values: unknown[]) {
      return new Statement(this.sql, values.map(value => {
        if (value instanceof ArrayBuffer) return Array.from(new Uint8Array(value));
        if (ArrayBuffer.isView(value)) return Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
        return value;
      }));
    }
    async all<T = Record<string, unknown>>(): Promise<D1Result<T>> {return (await query([this]))[0] as D1Result<T>;}
    run<T = Record<string, unknown>>() {return this.all<T>();}
    async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
      const row = (await this.all<Record<string, unknown>>()).results[0];
      if (!row) return null;
      if (column !== undefined && !(column in row)) throw new Error('D1 column not found');
      return (column === undefined ? row : row[column]) as T;
    }
    async raw(options?: {columnNames?: boolean}) {
      const rows = (await this.all<Record<string, unknown>>()).results;
      const columns = Object.keys(rows[0] || {});
      const values = rows.map(row => columns.map(column => row[column]));
      return options?.columnNames ? [columns, ...values] : values;
    }
  }
  return {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      if (statements.some(statement => !(statement instanceof Statement))) throw new Error('D1 statements must belong to this database');
      if (!statements.length) return [];
      const results = await query(statements, true);
      if (results.length !== statements.length) throw new Error('D1 batch result count mismatch');
      return results;
    },
    async exec(sql: string) {
      const results = await query([{sql, params: []}]);
      return {count: results.length, duration: results.reduce((sum, result) => sum + Number(result.meta.duration || 0), 0)};
    },
    withSession() {throw new Error('D1 HTTP sessions are not supported');},
    dump() {throw new Error('Use the Cloudflare D1 export API');},
  } as unknown as D1Database;
}
