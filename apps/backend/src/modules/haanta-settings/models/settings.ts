import { model } from "@medusajs/framework/utils"

export const Setting = model.define("haanta_setting", {
  id: model.id({ prefix: "hset" }).primaryKey(),
  key: model.text().unique(),
  value: model.json(),
  version: model.number().default(1),
  updated_by: model.text().nullable(),
})

