import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/**
 * The vendor ledger is append-only. Row-level UPDATE and DELETE are rejected by the database itself,
 * so neither application bugs nor a compromised admin session can rewrite history. Corrections are
 * made with reversing entries.
 */
export class Migration20261017100000 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE OR REPLACE FUNCTION haanta_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only (% blocked)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;`)
    for (const table of ["ledger_entry", "delivery_record", "payout", "payout_allocation"]) {
      this.addSql(`DROP TRIGGER IF EXISTS "${table}_append_only" ON "${table}";`)
      this.addSql(`CREATE TRIGGER "${table}_append_only" BEFORE UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION haanta_block_mutation();`)
    }
  }

  override async down(): Promise<void> {
    for (const table of ["ledger_entry", "delivery_record", "payout", "payout_allocation"]) {
      this.addSql(`DROP TRIGGER IF EXISTS "${table}_append_only" ON "${table}";`)
    }
  }
}
