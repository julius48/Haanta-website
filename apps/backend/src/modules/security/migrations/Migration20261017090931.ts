import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261017090931 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "webhook_event" drop constraint if exists "webhook_event_provider_event_id_unique";`);
    this.addSql(`alter table if exists "staff_role" drop constraint if exists "staff_role_user_id_unique";`);
    this.addSql(`alter table if exists "mfa_session" drop constraint if exists "mfa_session_key_hash_unique";`);
    this.addSql(`alter table if exists "mfa_factor" drop constraint if exists "mfa_factor_actor_type_actor_id_unique";`);
    this.addSql(`create table if not exists "mfa_factor" ("id" text not null, "actor_type" text check ("actor_type" in ('user', 'vendor')) not null, "actor_id" text not null, "secret_enc" text not null, "confirmed_at" timestamptz null, "last_used_counter" integer null, "recovery_hashes" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mfa_factor_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mfa_factor_deleted_at" ON "mfa_factor" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mfa_factor_actor_type_actor_id_unique" ON "mfa_factor" ("actor_type", "actor_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "mfa_session" ("id" text not null, "key_hash" text not null, "actor_type" text check ("actor_type" in ('user', 'vendor')) not null, "actor_id" text not null, "expires_at" timestamptz not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "mfa_session_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_mfa_session_key_hash_unique" ON "mfa_session" ("key_hash") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_mfa_session_deleted_at" ON "mfa_session" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "staff_role" ("id" text not null, "user_id" text not null, "role" text check ("role" in ('admin', 'catalog_reviewer', 'finance', 'support')) not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "staff_role_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_staff_role_user_id_unique" ON "staff_role" ("user_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_staff_role_deleted_at" ON "staff_role" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "webhook_event" ("id" text not null, "provider" text not null, "event_id" text not null, "type" text not null, "status" text check ("status" in ('processing', 'processed', 'failed')) not null default 'processing', "error" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "webhook_event_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_webhook_event_deleted_at" ON "webhook_event" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_webhook_event_provider_event_id_unique" ON "webhook_event" ("provider", "event_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "mfa_factor" cascade;`);

    this.addSql(`drop table if exists "mfa_session" cascade;`);

    this.addSql(`drop table if exists "staff_role" cascade;`);

    this.addSql(`drop table if exists "webhook_event" cascade;`);
  }

}
