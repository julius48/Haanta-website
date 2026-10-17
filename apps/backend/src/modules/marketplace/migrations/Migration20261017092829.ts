import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261017092829 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "line_price_snapshot" add column if not exists "product_title" text null, add column if not exists "variant_title" text null, add column if not exists "fulfilment_type" text null;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "line_price_snapshot" drop column if exists "product_title", drop column if exists "variant_title", drop column if exists "fulfilment_type";`);
  }

}
