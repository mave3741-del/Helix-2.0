import { smartMoneyObservationId, type SmartMoneyObservation } from './smart-money.ts';

export interface SmartMoneyQuery {
  asset?: string;
  source?: SmartMoneyObservation['source'];
  entityId?: string;
  asOfTs?: number;
  limit?: number;
}

export interface SmartMoneyStore {
  put(observation: SmartMoneyObservation): Promise<{ inserted: boolean; id: string }>;
  putMany(observations: SmartMoneyObservation[]): Promise<number>;
  query(query?: SmartMoneyQuery): Promise<SmartMoneyObservation[]>;
}

export class InMemorySmartMoneyStore implements SmartMoneyStore {
  private readonly items = new Map<string, SmartMoneyObservation>();

  async put(observation: SmartMoneyObservation) {
    const id = await smartMoneyObservationId(observation);
    const inserted = !this.items.has(id);
    if (inserted) this.items.set(id, structuredClone(observation));
    return { inserted, id };
  }

  async putMany(observations: SmartMoneyObservation[]) {
    let inserted = 0;
    for (const observation of observations) if ((await this.put(observation)).inserted) inserted += 1;
    return inserted;
  }

  async query(query: SmartMoneyQuery = {}) {
    const limit = Math.max(1, Math.min(1000, Math.floor(query.limit ?? 200)));
    return [...this.items.values()]
      .filter((item) => !query.asset || item.asset === query.asset)
      .filter((item) => !query.source || item.source === query.source)
      .filter((item) => !query.entityId || item.entity?.entityId === query.entityId)
      .filter((item) => query.asOfTs === undefined || item.availableTs <= query.asOfTs)
      .sort((a, b) => b.availableTs - a.availableTs || b.eventTs - a.eventTs)
      .slice(0, limit)
      .map((item) => structuredClone(item));
  }
}

interface SqlLike {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

function fromRow(row: Record<string, unknown>): SmartMoneyObservation {
  return {
    source: String(row.source) as SmartMoneyObservation['source'],
    entity: row.entity == null ? null : typeof row.entity === 'string' ? JSON.parse(row.entity) : row.entity as SmartMoneyObservation['entity'],
    asset: String(row.asset),
    action: String(row.action) as SmartMoneyObservation['action'],
    notionalUsd: row.notional_usd == null ? undefined : Number(row.notional_usd),
    quantity: row.quantity == null ? undefined : Number(row.quantity),
    direction: row.direction == null ? undefined : String(row.direction) as SmartMoneyObservation['direction'],
    from: row.from_address == null ? null : String(row.from_address),
    to: row.to_address == null ? null : String(row.to_address),
    eventTs: new Date(String(row.event_ts)).getTime(),
    publishedTs: new Date(String(row.published_ts)).getTime(),
    availableTs: new Date(String(row.available_ts)).getTime(),
    asOfTs: new Date(String(row.as_of_ts)).getTime(),
    provenance: typeof row.provenance === 'string' ? JSON.parse(row.provenance) : row.provenance as Record<string, unknown>,
    payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload as Record<string, unknown>,
  };
}

export class SqlSmartMoneyStore implements SmartMoneyStore {
  private sqlPromise: Promise<SqlLike> | null = null;
  private sql(): Promise<SqlLike> {
    this.sqlPromise ??= import('../lib/db.ts').then(({ getSql }) => getSql());
    return this.sqlPromise;
  }

  async put(observation: SmartMoneyObservation) {
    const id = await smartMoneyObservationId(observation);
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `insert into trading_smart_money_observations
        (observation_id, source, asset, entity, action, notional_usd, quantity, direction, from_address, to_address,
         event_ts, published_ts, available_ts, as_of_ts, provenance, payload)
       values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,to_timestamp($11/1000.0),to_timestamp($12/1000.0),to_timestamp($13/1000.0),to_timestamp($14/1000.0),$15::jsonb,$16::jsonb)
       on conflict (observation_id) do nothing returning observation_id`,
      [id, observation.source, observation.asset, JSON.stringify(observation.entity), observation.action, observation.notionalUsd ?? null,
        observation.quantity ?? null, observation.direction ?? null, observation.from ?? null, observation.to ?? null,
        observation.eventTs, observation.publishedTs, observation.availableTs, observation.asOfTs,
        JSON.stringify(observation.provenance), JSON.stringify(observation.payload)]
    );
    return { inserted: rows.length > 0, id };
  }

  async putMany(observations: SmartMoneyObservation[]) {
    let inserted = 0;
    for (const observation of observations) if ((await this.put(observation)).inserted) inserted += 1;
    return inserted;
  }

  async query(query: SmartMoneyQuery = {}) {
    const sql = await this.sql();
    const rows = await sql.query<Record<string, unknown>>(
      `select * from trading_smart_money_observations
       where ($1::text is null or asset=$1)
         and ($2::text is null or source=$2)
         and ($3::text is null or entity->>'entityId'=$3)
         and ($4::timestamptz is null or available_ts <= $4)
       order by available_ts desc, event_ts desc limit $5`,
      [query.asset ?? null, query.source ?? null, query.entityId ?? null, query.asOfTs == null ? null : new Date(query.asOfTs), Math.max(1, Math.min(1000, Math.floor(query.limit ?? 200)))]
    );
    return rows.map(fromRow);
  }
}
