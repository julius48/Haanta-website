import { Migration } from "@medusajs/framework/mikro-orm/migrations"

/** The audit log is append-only; UPDATE and DELETE are rejected by the database. */
export class Migration20261017100001 extends Migration {
  override async up(): Promise<void> {
    this.addSql(`CREATE OR REPLACE FUNCTION haanta_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'table % is append-only (% blocked)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;`)
    this.addSql(`DROP TRIGGER IF EXISTS "audit_log_append_only" ON "audit_log";`)
    this.addSql(`CREATE TRIGGER "audit_log_append_only" BEFORE UPDATE OR DELETE ON "audit_log" FOR EACH ROW EXECUTE FUNCTION haanta_block_mutation();`)
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TRIGGER IF EXISTS "audit_log_append_only" ON "audit_log";`)
  }
}
