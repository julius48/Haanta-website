import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261017092241 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "payout_allocation" drop constraint if exists "payout_allocation_entry_id_unique";`);
    this.addSql(`alter table if exists "ledger_entry" drop constraint if exists "ledger_entry_idempotency_key_unique";`);
    this.addSql(`alter table if exists "delivery_record" drop constraint if exists "delivery_record_order_id_vendor_id_unique";`);
    this.addSql(`create table if not exists "delivery_record" ("id" text not null, "order_id" text not null, "vendor_id" text not null, "delivered_at" timestamptz not null, "return_window_days" integer not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "delivery_record_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_delivery_record_deleted_at" ON "delivery_record" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_delivery_record_order_id_vendor_id_unique" ON "delivery_record" ("order_id", "vendor_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "ledger_entry" ("id" text not null, "vendor_id" text not null, "order_id" text not null, "order_line_id" text not null, "type" text check ("type" in ('sale', 'reversal')) not null, "amount_minor" integer not null, "currency" text not null, "quantity" integer not null, "unit_vendor_price_minor" integer not null, "reverses_entry_id" text null, "reason" text check ("reason" in ('refund', 'cancellation', 'return')) null, "idempotency_key" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ledger_entry_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_ledger_entry_idempotency_key_unique" ON "ledger_entry" ("idempotency_key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ledger_entry_deleted_at" ON "ledger_entry" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ledger_entry_vendor_id" ON "ledger_entry" ("vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ledger_entry_order_id" ON "ledger_entry" ("order_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "payout" ("id" text not null, "vendor_id" text not null, "amount_minor" integer not null, "currency" text not null, "paid_at" timestamptz not null, "bank_reference" text not null, "recorded_by" text not null, "note" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "payout_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payout_deleted_at" ON "payout" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payout_vendor_id" ON "payout" ("vendor_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "payout_allocation" ("id" text not null, "payout_id" text not null, "entry_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "payout_allocation_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_payout_allocation_entry_id_unique" ON "payout_allocation" ("entry_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payout_allocation_deleted_at" ON "payout_allocation" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payout_allocation_payout_id" ON "payout_allocation" ("payout_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "delivery_record" cascade;`);

    this.addSql(`drop table if exists "ledger_entry" cascade;`);

    this.addSql(`drop table if exists "payout" cascade;`);

    this.addSql(`drop table if exists "payout_allocation" cascade;`);
  }

}
