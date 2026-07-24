import { BaseRepository } from "./baseRepository";

export class UserRepository extends BaseRepository {
  constructor() {
    super("users");
  }
}

export class AddressRepository extends BaseRepository {
  constructor() {
    super("addresses");
  }
}

export class CategoryRepository extends BaseRepository {
  constructor() {
    super("categories");
  }
}

export class MenuItemRepository extends BaseRepository {
  constructor() {
    super("menuItems");
  }
}

export class BannerRepository extends BaseRepository {
  constructor() {
    super("banners");
  }
}

export class DealRepository extends BaseRepository {
  constructor() {
    super("deals");
  }
}

export class CouponRepository extends BaseRepository {
  constructor() {
    super("coupons");
  }
}

export class OrderRepository extends BaseRepository {
  constructor() {
    super("orders");
  }
}

export class OrderTrackingRepository extends BaseRepository {
  constructor() {
    super("orderTracking");
  }
}

export class DeliveryPartnerRepository extends BaseRepository {
  constructor() {
    super("deliveryPartners");
  }
}

export class WalletTransactionRepository extends BaseRepository {
  constructor() {
    super("walletTransactions");
  }
}

export class SupportTicketRepository extends BaseRepository {
  constructor() {
    super("supportTickets");
  }
}

export class NotificationRepository extends BaseRepository {
  constructor() {
    super("notifications");
  }
}

export class ReviewRepository extends BaseRepository {
  constructor() {
    super("reviews");
  }
}

export class AppSettingsRepository extends BaseRepository {
  constructor() {
    super("appSettings");
  }
}

export class AuditLogRepository extends BaseRepository {
  constructor() {
    super("auditLogs");
  }

  async logAction(userId, module, action, metadata) {
    return this.create({
      userId,
      module,
      action,
      metadata,
      timestamp: new Date().toISOString()
    });
  }
}

export class DietFoodRepository extends BaseRepository {
  constructor() {
    super("dietFoods");
  }
}

export class MealPlanRepository extends BaseRepository {
  constructor() {
    super("mealPlans");
  }
}

export class DietCategoryRepository extends BaseRepository {
  constructor() {
    super("dietCategories");
  }
}

export class DietOfferRepository extends BaseRepository {
  constructor() {
    super("dietOffers");
  }
}

export class DietBannerRepository extends BaseRepository {
  constructor() {
    super("dietBanners");
  }
}

export class SubscriptionRepository extends BaseRepository {
  constructor() {
    super("subscriptions");
  }
}

export class PaymentRepository extends BaseRepository {
  constructor() {
    super("payments");
  }
}

export class FavoriteRepository extends BaseRepository {
  constructor() {
    super("favorites");
  }
}

export class CartRepository extends BaseRepository {
  constructor() {
    super("carts");
  }
}

export class SystemCounterRepository extends BaseRepository {
  constructor() {
    super("systemCounters");
  }
}

export class ThreatScoreRepository extends BaseRepository {
  constructor() {
    super("threatScores");
  }
}

// Instantiate and export singleton instances for easy usage
export const userRepository = new UserRepository();
export const addressRepository = new AddressRepository();
export const categoryRepository = new CategoryRepository();
export const menuItemRepository = new MenuItemRepository();
export const bannerRepository = new BannerRepository();
export const dealRepository = new DealRepository();
export const couponRepository = new CouponRepository();
export const orderRepository = new OrderRepository();
export const orderTrackingRepository = new OrderTrackingRepository();
export const deliveryPartnerRepository = new DeliveryPartnerRepository();
export const walletTransactionRepository = new WalletTransactionRepository();
export const supportTicketRepository = new SupportTicketRepository();
export const notificationRepository = new NotificationRepository();
export const reviewRepository = new ReviewRepository();
export const appSettingsRepository = new AppSettingsRepository();
export const auditLogRepository = new AuditLogRepository();
export const dietFoodRepository = new DietFoodRepository();
export const mealPlanRepository = new MealPlanRepository();
export const dietCategoryRepository = new DietCategoryRepository();
export const dietOfferRepository = new DietOfferRepository();
export const dietBannerRepository = new DietBannerRepository();
export const subscriptionRepository = new SubscriptionRepository();
export const paymentRepository = new PaymentRepository();
export const favoriteRepository = new FavoriteRepository();
export const cartRepository = new CartRepository();
export const systemCounterRepository = new SystemCounterRepository();
export const threatScoreRepository = new ThreatScoreRepository();

