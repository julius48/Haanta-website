import { model } from "@medusajs/framework/utils"

export const ProductReview = model
  .define("product_review", {
    id: model.id({ prefix: "rev" }).primaryKey(),
    product_id: model.text(),
    customer_id: model.text(),
    /** Shown publicly instead of the customer's name, e.g. "Adaeze O." */
    display_name: model.text(),
    verified_purchase: model.boolean().default(false),
    rating: model.number(),
    title: model.text().nullable(),
    body: model.text(),
    fit: model.enum(["runs_small", "true_to_size", "runs_large"]).nullable(),
    photos: model.array(),
    status: model.enum(["pending", "approved", "rejected"]).default("pending"),
  })
  .indexes([{ on: ["product_id", "status"] }, { on: ["customer_id", "product_id"], unique: true }])
