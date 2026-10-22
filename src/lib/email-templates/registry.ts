import type { ComponentType } from 'react'
import { template as loyaltyProgramLaunchTemplate } from './loyalty-program-launch'
import { template as giftVoucherTemplate } from './gift-voucher'
import { template as couponBroadcastTemplate } from './coupon-broadcast'
import { template as backInStockTemplate } from './back-in-stock'
import { template as arteEmCardsDescontinuadaTemplate } from './arte-em-cards-descontinuada'
import { template as adminBroadcastTemplate } from './admin-broadcast'
import { template as comunidadeLaunchTemplate } from './comunidade-launch'
import { template as orderReceivedTemplate } from './order-received'
import { template as orderStatusUpdatedTemplate } from './order-status-updated'
import { template as paymentConfirmedTemplate } from './payment-confirmed'
import { template as priceDropTemplate } from './price-drop'
import { template as adminCancellationRequestedTemplate } from './admin-cancellation-requested'
import { template as arteEmCardsCodeTemplate } from './arte-em-cards-code'
import { template as stackAuctionStoredTemplate } from './stack-auction-stored'
import { template as stackOrderStoredTemplate } from './stack-order-stored'
import { template as stackReminderTemplate } from './stack-reminder'
import { template as stackExpiredTemplate } from './stack-expired'
import { template as pickupReopenedTemplate } from './pickup-reopened'
import { template as scheduleConfirmedTemplate } from './schedule-confirmed'
import { template as eventChangedTemplate } from './event-changed'
import { template as buyerReceiptConfirmedTemplate } from './buyer-receipt-confirmed'
import { template as fulfillmentUpdateTemplate } from './fulfillment-update'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 */
export const TEMPLATES: Record<string, TemplateEntry> = {
  'loyalty-program-launch': loyaltyProgramLaunchTemplate,
  'gift-voucher': giftVoucherTemplate,
  'coupon-broadcast': couponBroadcastTemplate,
  'back-in-stock': backInStockTemplate,
  'arte-em-cards-descontinuada': arteEmCardsDescontinuadaTemplate,
  'admin-broadcast': adminBroadcastTemplate,
  'comunidade-launch': comunidadeLaunchTemplate,
  'order-received': orderReceivedTemplate,
  'order-status-updated': orderStatusUpdatedTemplate,
  'payment-confirmed': paymentConfirmedTemplate,
  'price-drop': priceDropTemplate,
  'admin-cancellation-requested': adminCancellationRequestedTemplate,
  'arte-em-cards-code': arteEmCardsCodeTemplate,
  'stack-auction-stored': stackAuctionStoredTemplate,
  'stack-order-stored': stackOrderStoredTemplate,
  'stack-reminder': stackReminderTemplate,
  'stack-expired': stackExpiredTemplate,
  'pickup-reopened': pickupReopenedTemplate,
  'schedule-confirmed': scheduleConfirmedTemplate,
  'event-changed': eventChangedTemplate,
  'buyer-receipt-confirmed': buyerReceiptConfirmedTemplate,
  'fulfillment-update': fulfillmentUpdateTemplate,
}
