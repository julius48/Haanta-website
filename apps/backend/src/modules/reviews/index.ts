import { Module } from "@medusajs/framework/utils"
import { ReviewsService } from "./service"

export const REVIEWS_MODULE = "reviews"
export * from "./service"

export default Module(REVIEWS_MODULE, { service: ReviewsService })
