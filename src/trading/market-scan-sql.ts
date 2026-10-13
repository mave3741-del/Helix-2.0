import { getSql } from "@/lib/db";
import type { MarketScanRecord, MarketScanProvenanceStore } from "./market-scan-provenance";

export class SqlMarketScanProvenanceStore implements MarketScanProvenanceStore {
  private async sql() { return getSql(); }
  async append(record: MarketScanRecord): Promise<void> {
    const sql = await this.sql();
    await sql.query(`insert into trading_market_scan_provenance
      (scan_id,cadence,started_at,completed_at,universe_id,universe_version,universe_as_of_ts,universe_size,valid_markets,rejected_markets,score_version,policy_version,provenance,rejection_reasons,candidates,recorded_at)
      values ($1,$2,to_timestamp($3/1000.0),to_timestamp($4/1000.0),$5,$6,to_timestamp($7/1000.0),$8,$9,$10,$11,$12,$13::jsonb,$14::jsonb,$15::jsonb,to_timestamp($16/1000.0))
      on conflict (scan_id) do nothing`, [record.scanId,record.cadence,record.startedAt,record.completedAt,record.universeId ?? null,record.universeVersion ?? null,record.universeAsOfTs ?? null,record.universeSize,record.validMarkets,record.rejectedMarkets,record.scoreVersion,record.policyVersion,JSON.stringify(record.provenance ?? null),JSON.stringify(record.rejectionReasons ?? null),JSON.stringify(record.candidates),record.recordedAt]);
  }
  async get(scanId: string): Promise<MarketScanRecord | null> {
    const sql = await this.sql(); const rows = await sql.query<Record<string,unknown>>(`select * from trading_market_scan_provenance where scan_id=$1`,[scanId]);
    return rows[0] ? fromRow(rows[0]) : null;
  }
  async list(limit = 100): Promise<MarketScanRecord[]> {
    const sql = await this.sql(); const rows = await sql.query<Record<string,unknown>>(`select * from trading_market_scan_provenance order by completed_at desc, scan_id desc limit $1`,[Math.max(1,Math.min(1000,limit))]);
    return rows.map(fromRow);
  }
}
function fromRow(row: Record<string,unknown>): MarketScanRecord {
  const ms = (v: unknown) => v instanceof Date ? v.getTime() : Number(v);
  const json = <T>(v: unknown): T | undefined => v == null ? undefined : typeof v === "string" ? JSON.parse(v) as T : v as T;
  return { scanId:String(row.scan_id), cadence:row.cadence as MarketScanRecord["cadence"], startedAt:ms(row.started_at), completedAt:ms(row.completed_at), universeId:row.universe_id ? String(row.universe_id):undefined, universeVersion:row.universe_version ? String(row.universe_version):undefined, universeAsOfTs:row.universe_as_of_ts ? ms(row.universe_as_of_ts):undefined, universeSize:Number(row.universe_size), validMarkets:Number(row.valid_markets), rejectedMarkets:Number(row.rejected_markets), scoreVersion:String(row.score_version), policyVersion:String(row.policy_version), provenance:json(row.provenance), rejectionReasons:json(row.rejection_reasons), candidates:json(row.candidates) ?? [], recordedAt:ms(row.recorded_at) };
}
