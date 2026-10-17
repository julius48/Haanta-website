import { MedusaService, MedusaError } from "@medusajs/framework/utils"
import {
  LinePriceSnapshot,
  ProductAttributes,
  ProductListing,
  SizeChart,
  VariantPricing,
  Vendor,
  VendorOrder,
  VendorUser,
  VerificationToken,
} from "./models"

export class MarketplaceService extends MedusaService({
  Vendor,
  VendorUser,
  VerificationToken,
  SizeChart,
  ProductListing,
  ProductAttributes,
  VariantPricing,
  LinePriceSnapshot,
  VendorOrder,
}) {
  /**
   * Vendor-scoped lookups. These always filter by the authenticated vendor and throw NOT_FOUND
   * (not FORBIDDEN) for other vendors' records, so ids cannot be probed.
   */
  async getOwnListing(vendorId: string, listingId: string) {
    const [row] = await this.listProductListings({ id: listingId, vendor_id: vendorId })
    if (!row) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Product not found")
    return row
  }

  async getOwnVendorOrder(vendorId: string, vendorOrderId: string) {
    const [row] = await this.listVendorOrders({ id: vendorOrderId, vendor_id: vendorId })
    if (!row) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Order not found")
    return row
  }

  async getOwnSizeChart(vendorId: string, sizeChartId: string) {
    const [row] = await this.listSizeCharts({ id: sizeChartId, vendor: { id: vendorId } } as never)
    if (!row) throw new MedusaError(MedusaError.Types.NOT_FOUND, "Size chart not found")
    return row
  }
}

