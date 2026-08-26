import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
  Index,
} from 'typeorm';
import { Tenant } from '../tenants/tenant.entity';
import { Category } from '../categories/category.entity';
import { Product } from '../products/product.entity';
import { Location } from '../locations/location.entity';
import { numericTransformer } from '../../common/utils/numeric-transformer';

// Promoção de verdade, no molde do que iFood/McDonald's realmente fazem
// (não um "desconto genérico solto"):
//  - pode ter FOTO própria (banner) ou, se não tiver, herdar a foto do
//    produto vinculado quando scope = 'product' (ver PromotionsService
//    .attachDisplayImage) — sempre mostra algo visual, nunca um ícone
//    vazio.
//  - tem ESCOPO: vale pra tudo, só pra uma categoria (ex: "30% off em
//    pizzas") ou só pra um produto específico (ex: "R$5 off no Burger).
//  - pode ter LIMITE DE USO POR CLIENTE (o clássico cupom "só pra quem
//    nunca comprou" = usageLimitPerCustomer = 1) e/ou um TETO GLOBAL de
//    quantos pedidos podem usar essa promoção no total.
//  - tem janela de validade real (startsAt/endsAt) que vira uma
//    contagem regressiva de verdade no cardápio do cliente.
// O desconto em si é SEMPRE recalculado no backend na hora do pedido —
// ver PromotionsService.pickBestApplicable e OrdersService.create.
@Entity('promotions')
export class Promotion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // Título curto do card (ex: "50% off", "R$10 off no combo") — texto
  // livre do admin, nunca gerado automaticamente.
  @Column({ length: 60 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // Banner do card. Se ficar em branco e scope = 'product' com só UM
  // produto vinculado, o cardápio usa a foto desse produto como
  // fallback (ver PromotionsService.attachDisplayImage) — assim toda
  // promoção sempre tem uma foto de verdade, igual McDonald's/iFood.
  @Column({ name: 'image_url', type: 'text', nullable: true })
  imageUrl: string | null;

  @Column({ name: 'discount_type', type: 'varchar', length: 20 })
  discountType: 'percentage' | 'fixed';

  // percentage: 0-100. fixed: valor em R$.
  @Column({ name: 'discount_value', type: 'numeric', precision: 10, scale: 2, transformer: numericTransformer })
  discountValue: number;

  // OBRIGATÓRIO quando discountType='percentage' (ver validateDiscountValue)
  // — teto em R$ pro desconto, exatamente como todo cupom de verdade do
  // iFood/McDonald's mostra ("50% OFF, até R$15"). Sem isso, um pedido
  // grande (ex: 10x do mesmo item) geraria um desconto sem limite, que
  // foi um bug real já visto em produção. Não se aplica a desconto
  // 'fixed' (esse já tem teto embutido no próprio valor).
  @Column({ name: 'max_discount_amount', type: 'numeric', precision: 10, scale: 2, nullable: true, transformer: numericTransformer })
  maxDiscountAmount: number | null;

  // Valor mínimo do PEDIDO INTEIRO (não só dos itens elegíveis) pra
  // promoção valer — mesma regra do cupom iFood ("válido para compras
  // acima de R$X"). 0 = sem mínimo.
  @Column({ name: 'min_order_value', type: 'numeric', precision: 10, scale: 2, default: 0, transformer: numericTransformer })
  minOrderValue: number;

  // A quais itens do carrinho o desconto se aplica de fato:
  //  - 'all': subtotal inteiro do pedido.
  //  - 'category': só a soma dos itens das categorias vinculadas.
  //  - 'product': só a soma dos itens dos produtos vinculados.
  // O valor mínimo do pedido (acima) sempre olha pro carrinho INTEIRO,
  // mesmo quando o escopo do desconto é mais restrito — é assim que
  // iFood faz (incentiva o cliente a completar o pedido mínimo mesmo
  // que o desconto só valha pra parte dele).
  @Column({ type: 'varchar', length: 20, default: 'all' })
  scope: 'all' | 'category' | 'product';

  @ManyToMany(() => Category, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'promotion_categories',
    joinColumn: { name: 'promotion_id' },
    inverseJoinColumn: { name: 'category_id' },
  })
  categories: Category[];

  @ManyToMany(() => Product, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'promotion_products',
    joinColumn: { name: 'promotion_id' },
    inverseJoinColumn: { name: 'product_id' },
  })
  products: Product[];

  // Em quais lojas (filiais) essa promoção vale. Vazio = todas as lojas
  // do tenant (mesmo padrão de "sem restrição" usado em categories
  // /products, mas essa é uma dimensão independente do escopo de item —
  // uma promoção pode valer só na "Unidade Shopping" e ainda ser
  // restrita a uma categoria específica, ao mesmo tempo).
  @ManyToMany(() => Location, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'promotion_locations',
    joinColumn: { name: 'promotion_id' },
    inverseJoinColumn: { name: 'location_id' },
  })
  locations: Location[];

  // false (padrão, mais rigoroso): usar a promoção em QUALQUER loja do
  // tenant consome o limite por cliente nas outras também — um cliente
  // não pode usar "1x por cliente" na Unidade A e usar de novo na
  // Unidade B. true: cada loja controla o uso independentemente pro
  // mesmo cliente.
  @Column({ name: 'allow_reuse_across_locations', default: false })
  allowReuseAcrossLocations: boolean;

  // null = sem limite (cliente pode usar em todo pedido, enquanto
  // válida). 1 = clássico cupom de primeira compra / uso único.
  // Promoções com limite por cliente só valem pra cliente LOGADO — ver
  // PromotionsService.pickBestApplicable (convidado nunca é elegível a
  // uma promoção limitada, pra não dar brecha de reuso).
  @Column({ name: 'usage_limit_per_customer', type: 'int', nullable: true })
  usageLimitPerCustomer: number | null;

  // Teto global de quantos PEDIDOS no total podem usar essa promoção —
  // null = sem teto. Quando `redemptionCount` atinge esse valor, a
  // promoção some do cardápio sozinha (ver findActiveForPublic).
  @Column({ name: 'max_redemptions', type: 'int', nullable: true })
  maxRedemptions: number | null;

  // Contador incrementado atomicamente (UPDATE ... SET x = x + 1) toda
  // vez que um pedido usa essa promoção — ver
  // PromotionsService.recordRedemption, chamado dentro da MESMA
  // transação da criação do pedido em OrdersService.create. Devolvido
  // (decrementado) se o pedido for cancelado depois — ver
  // PromotionsService.releaseRedemption / OrdersService.markCancelled.
  @Column({ name: 'redemption_count', type: 'int', default: 0 })
  redemptionCount: number;

  // Quantas UNIDADES elegíveis, no máximo, contam pro cálculo do
  // desconto — null = sem limite (o carrinho elegível inteiro conta,
  // podendo crescer com a quantidade, útil pra promoções tipo "10% off
  // em toda a categoria"). Com um número aqui (ex: 1 ou 2), o desconto
  // fica travado nessas unidades mesmo que o cliente adicione mais do
  // mesmo item elegível — e essas unidades ficam isoladas visualmente
  // no carrinho, separadas das unidades "normais" do mesmo produto (ver
  // PromotionsService.computeEligibleUnits).
  @Column({ name: 'max_eligible_quantity', type: 'int', nullable: true })
  maxEligibleQuantity: number | null;

  // "Resetar pra TODOS" (painel admin) — devolve o uso de TODO MUNDO de
  // uma vez, sem apagar nem tocar em nenhum pedido antigo. A checagem de
  // limite por cliente (PromotionsService.getCustomerUsedCount) ignora
  // qualquer pedido criado ANTES desse timestamp — igual o reset
  // individual (PromotionCustomerReset), só que valendo pra todo mundo
  // de uma vez em vez de cliente por cliente.
  @Column({ name: 'usage_reset_at', type: 'timestamptz', nullable: true })
  usageResetAt: Date | null;

  // Snapshot de quantos clientes DIFERENTES tinham usado a promoção no
  // momento do último "resetar pra todos" — guardado só pra referência
  // histórica do admin ("300 pessoas usaram até o último reset"), já
  // que depois do reset o contador de uso por cliente volta a zero pra
  // todo mundo.
  @Column({ name: 'usage_count_before_reset', type: 'int', nullable: true })
  usageCountBeforeReset: number | null;

  @Column({ name: 'is_active', default: true })
  isActive: boolean;

  @Column({ name: 'starts_at', type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ name: 'ends_at', type: 'timestamptz', nullable: true })
  endsAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz' })
  deletedAt: Date | null;
}
