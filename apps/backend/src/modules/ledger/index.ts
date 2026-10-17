import { Module } from "@medusajs/framework/utils"
import { LedgerService } from "./service"

export const LEDGER_MODULE = "ledger"
export * from "./service"

export default Module(LEDGER_MODULE, { service: LedgerService })
