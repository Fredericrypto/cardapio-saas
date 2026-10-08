import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Note } from '../modules/notes/note.entity';
import { InternalNotification } from '../modules/internal-notifications/internal-notification.entity';
import { InternalNotificationRead } from '../modules/internal-notifications/internal-notification-read.entity';
import { UserPushSubscription } from '../modules/internal-notifications/user-push-subscription.entity';
import { CashTransaction } from '../modules/cash/cash-transaction.entity';
import { Tenant } from '../modules/tenants/tenant.entity';
import { Location } from '../modules/locations/location.entity';
import { AdminUser } from '../modules/auth/admin-user.entity';
import { Category } from '../modules/categories/category.entity';
import { Product } from '../modules/products/product.entity';
import { ProductOption } from '../modules/products/product-option.entity';
import { ProductOptionValue } from '../modules/products/product-option-value.entity';
import { Order } from '../modules/orders/order.entity';
import { OrderItem } from '../modules/orders/order-item.entity';
import { RestaurantTable } from '../modules/tables/restaurant-table.entity';
import { TableSession } from '../modules/tables/table-session.entity';
import { TableSessionParticipant } from '../modules/tables/table-session-participant.entity';
import { WaiterCall } from '../modules/tables/waiter-call.entity';
import { Customer } from '../modules/customers/customer.entity';
import { Promotion } from '../modules/promotions/promotion.entity';
import { PromotionCustomerReset } from '../modules/promotions/promotion-customer-reset.entity';
import { OrderPromotionDiscount } from '../modules/promotions/order-promotion-discount.entity';
import { ReceiptRedemption } from '../modules/loyalty/receipt-redemption.entity';
import { LoyaltyProgram } from '../modules/loyalty/loyalty-program.entity';
import { LoyaltyStamp } from '../modules/loyalty/loyalty-stamp.entity';
import { LoyaltyReward } from '../modules/loyalty/loyalty-reward.entity';
import { CashbackSettings } from '../modules/cashback/cashback-settings.entity';
import { CashbackLedgerEntry } from '../modules/cashback/cashback-ledger-entry.entity';
import { CashbackConsumption } from '../modules/cashback/cashback-consumption.entity';
import { Review } from '../modules/reviews/review.entity';
import { ReviewResponse } from '../modules/reviews/review-response.entity';
import { PushSubscription } from '../modules/push/push-subscription.entity';
import { Role } from '../modules/roles/entities/role.entity';
import { Permission } from '../modules/roles/entities/permission.entity';
import { TenantBackup } from '../modules/backups/tenant-backup.entity';
import { TenantBackupSettings } from '../modules/backups/tenant-backup-settings.entity';
import { BackupAuditLog } from '../modules/backups/backup-audit-log.entity';

// Este arquivo é usado SOMENTE pelo TypeORM CLI (migrations).
// A aplicação NestJS em si usa TypeOrmModule.forRootAsync no app.module.ts.
// Manter os dois em sincronia evita comportamento diferente entre
// "rodar a app" e "rodar uma migration".

export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [
    Tenant,
    CashTransaction,
    Note,
    InternalNotification,
    InternalNotificationRead,
    UserPushSubscription,
    Location,
    AdminUser,
    Category,
    Product,
    ProductOption,
    ProductOptionValue,
    Order,
    OrderItem,
    RestaurantTable,
    TableSession,
    TableSessionParticipant,
    WaiterCall,
    Customer,
    Promotion,
    PromotionCustomerReset,
    OrderPromotionDiscount,
    ReceiptRedemption,
    LoyaltyProgram,
    LoyaltyStamp,
    LoyaltyReward,
    CashbackSettings,
    CashbackLedgerEntry,
    CashbackConsumption,
    Review,
    ReviewResponse,
    PushSubscription,
    Role,
    Permission,
    TenantBackup,
    TenantBackupSettings,
    BackupAuditLog,
  ],
  migrations: [__dirname + '/../migrations/*{.ts,.js}'],
  synchronize: false, // NUNCA true em produção — só migrations controlam o schema
  logging: process.env.NODE_ENV === 'development',
});

