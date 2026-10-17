import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261017090926 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "haanta_setting" drop constraint if exists "haanta_setting_key_unique";`);
    this.addSql(`create table if not exists "haanta_setting" ("id" text not null, "key" text not null, "value" jsonb not null, "version" integer not null default 1, "updated_by" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "haanta_setting_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_haanta_setting_key_unique" ON "haanta_setting" ("key") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_haanta_setting_deleted_at" ON "haanta_setting" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "haanta_setting" cascade;`);
  }

}
