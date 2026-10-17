import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261017092240 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "verification_token" drop constraint if exists "verification_token_token_hash_unique";`);
    this.addSql(`alter table if exists "vendor_user" drop constraint if exists "vendor_user_email_unique";`);
    this.addSql(`alter table if exists "vendor_order" drop constraint if exists "vendor_order_order_id_vendor_id_unique";`);
    this.addSql(`alter table if exists "vendor" drop constraint if exists "vendor_slug_unique";`);
    this.addSql(`alter table if exists "variant_pricing" drop constraint if exists "variant_pricing_variant_id_unique";`);
    this.addSql(`alter table if exists "product_listing" drop constraint if exists "product_listing_product_id_unique";`);
    this.addSql(`alter table if exists "product_attributes" drop constraint if exists "product_attributes_product_id_unique";`);
    this.addSql(`alter table if exists "line_price_snapshot" drop constraint if exists "line_price_snapshot_line_item_id_unique";`);
    this.addSql(`alter table if exists "category_markup" drop constraint if exists "category_markup_category_id_unique";`);
    this.addSql(`create table if not exists "category_markup" ("id" text not null, "category_id" text not null, "markup_bps" integer not null, "markup_fixed_minor" integer not null default 0, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "category_markup_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_category_markup_category_id_unique" ON "category_markup" ("category_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_category_markup_deleted_at" ON "category_markup" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "line_price_snapshot" ("id" text not null, "order_id" text not null, "line_item_id" text not null, "variant_id" text null, "product_id" text null, "vendor_id" text not null, "quantity" integer not null, "vendor_price_minor" integer not null, "retail_price_minor" integer not null, "currency" text not null, "markup_bps" integer not null, "markup_fixed_minor" integer not null, "markup_source" text not null, "stock_location" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "line_price_snapshot_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_line_price_snapshot_line_item_id_unique" ON "line_price_snapshot" ("line_item_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_line_price_snapshot_deleted_at" ON "line_price_snapshot" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_line_price_snapshot_order_id" ON "line_price_snapshot" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_line_price_snapshot_vendor_id" ON "line_price_snapshot" ("vendor_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "product_attributes" ("id" text not null, "product_id" text not null, "vendor_id" text not null, "fulfilment_type" text check ("fulfilment_type" in ('ready_to_wear', 'made_to_order')) not null default 'ready_to_wear', "lead_time_days" integer null, "is_preorder" boolean not null default false, "required_measurements" text[] not null, "size_chart_id" text null, "fit_notes" text null, "styles" text[] not null, "shops" text[] not null, "merch" text[] not null, "weight_missing" boolean not null default false, "markup_bps" integer null, "markup_fixed_minor" integer null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_attributes_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_attributes_product_id_unique" ON "product_attributes" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_attributes_deleted_at" ON "product_attributes" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_attributes_vendor_id" ON "product_attributes" ("vendor_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "product_listing" ("id" text not null, "vendor_id" text not null, "product_id" text null, "status" text check ("status" in ('draft', 'in_review', 'live', 'changes_requested')) not null default 'draft', "title" text not null, "pending_snapshot" jsonb null, "approved_snapshot" jsonb null, "review_note" text null, "submitted_at" timestamptz null, "reviewed_at" timestamptz null, "reviewed_by" text null, "weight_missing" boolean not null default false, "size_chart_missing" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_listing_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_listing_deleted_at" ON "product_listing" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_listing_vendor_id_status" ON "product_listing" ("vendor_id", "status") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_listing_product_id_unique" ON "product_listing" ("product_id") WHERE product_id IS NOT NULL AND deleted_at IS NULL;`);

    this.addSql(`create table if not exists "variant_pricing" ("id" text not null, "variant_id" text not null, "product_id" text not null, "vendor_id" text not null, "vendor_price_minor" integer not null, "retail_usd_minor" integer not null, "retail_cad_minor" integer not null, "markup_bps" integer not null, "markup_fixed_minor" integer not null, "markup_source" text not null, "stock_location" text check ("stock_location" in ('lagos', 'houston')) not null default 'lagos', "fulfilment_type" text check ("fulfilment_type" in ('ready_to_wear', 'made_to_order')) null, "weight_kg" integer null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "variant_pricing_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_variant_pricing_variant_id_unique" ON "variant_pricing" ("variant_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_variant_pricing_deleted_at" ON "variant_pricing" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_variant_pricing_product_id" ON "variant_pricing" ("product_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_variant_pricing_vendor_id" ON "variant_pricing" ("vendor_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vendor" ("id" text not null, "name" text not null, "slug" text not null, "logo_url" text null, "banner_url" text null, "story" text null, "origin_country" text not null default 'NG', "region" text null, "size_notes" text null, "policies" text null, "contact_email" text null, "markup_bps" integer null, "markup_fixed_minor" integer null, "status" text check ("status" in ('pending', 'active', 'paused', 'rejected')) not null default 'pending', "approved_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_slug_unique" ON "vendor" ("slug") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_deleted_at" ON "vendor" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "size_chart" ("id" text not null, "name" text not null, "unit" text check ("unit" in ('in', 'cm')) not null default 'in', "rows" jsonb not null, "notes" text null, "vendor_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "size_chart_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_size_chart_vendor_id" ON "size_chart" ("vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_size_chart_deleted_at" ON "size_chart" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vendor_order" ("id" text not null, "order_id" text not null, "display_id" text not null, "vendor_id" text not null, "status" text check ("status" in ('new', 'accepted', 'in_production', 'shipped_to_hub', 'received_at_hub', 'cancelled')) not null default 'new', "tracking_number" text null, "tracking_carrier" text null, "ship_by" timestamptz null, "accepted_at" timestamptz null, "shipped_at" timestamptz null, "received_at" timestamptz null, "is_preorder" boolean not null default false, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_order_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_deleted_at" ON "vendor_order" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_order_order_id_vendor_id_unique" ON "vendor_order" ("order_id", "vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_order_vendor_id_status" ON "vendor_order" ("vendor_id", "status") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vendor_user" ("id" text not null, "email" text not null, "name" text not null, "role" text check ("role" in ('owner', 'staff')) not null default 'owner', "email_verified_at" timestamptz null, "vendor_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_user_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_user_email_unique" ON "vendor_user" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_user_vendor_id" ON "vendor_user" ("vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_user_deleted_at" ON "vendor_user" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "verification_token" ("id" text not null, "purpose" text check ("purpose" in ('vendor_email', 'vendor_invite')) not null, "subject" text not null, "token_hash" text not null, "expires_at" timestamptz not null, "used_at" timestamptz null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "verification_token_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_verification_token_token_hash_unique" ON "verification_token" ("token_hash") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_verification_token_deleted_at" ON "verification_token" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "size_chart" add constraint "size_chart_vendor_id_foreign" foreign key ("vendor_id") references "vendor" ("id") on update cascade;`);

    this.addSql(`alter table if exists "vendor_user" add constraint "vendor_user_vendor_id_foreign" foreign key ("vendor_id") references "vendor" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "size_chart" drop constraint if exists "size_chart_vendor_id_foreign";`);

    this.addSql(`alter table if exists "vendor_user" drop constraint if exists "vendor_user_vendor_id_foreign";`);

    this.addSql(`drop table if exists "category_markup" cascade;`);

    this.addSql(`drop table if exists "line_price_snapshot" cascade;`);

    this.addSql(`drop table if exists "product_attributes" cascade;`);

    this.addSql(`drop table if exists "product_listing" cascade;`);

    this.addSql(`drop table if exists "variant_pricing" cascade;`);

    this.addSql(`drop table if exists "vendor" cascade;`);

    this.addSql(`drop table if exists "size_chart" cascade;`);

    this.addSql(`drop table if exists "vendor_order" cascade;`);

    this.addSql(`drop table if exists "vendor_user" cascade;`);

    this.addSql(`drop table if exists "verification_token" cascade;`);
  }

}
