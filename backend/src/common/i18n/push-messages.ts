import { DEFAULT_LANGUAGE, type AppLanguage } from './languages';

// Catálogo das notificações enviadas ao CLIENTE, nos 3 idiomas.
//
// REGRAS (módulo i18n):
//  - Valores monetários chegam já formatados em Reais ("R$ 12,50") pelo
//    chamador e NUNCA são convertidos para outra moeda.
//  - Conteúdo dinâmico (título/descrição de promoção, nome de estabelecimento,
//    motivo digitado pela equipe) entra por parâmetro e NÃO é traduzido.
//  - Mensagem desconhecida ou idioma sem tradução cai em pt-BR.

export type PushMessageKey =
  | 'payment_confirmed_table'
  | 'payment_confirmed_order'
  | 'cashback_earned'
  | 'review_prompt'
  | 'verification_approved'
  | 'verification_rejected'
  | 'verification_expired'
  | 'verification_revoked'
  | 'loyalty_reward'
  | 'loyalty_stamp'
  | 'new_promotion'
  | 'cashback_expiring_2d'
  | 'cashback_expiring_7d'
  | 'order_preparing'
  | 'order_ready_delivery'
  | 'order_ready_table'
  | 'order_ready_pickup'
  | 'order_done_delivery'
  | 'order_done_table'
  | 'order_done_pickup';

export type PushParams = Record<string, string | number>;
interface Copy {
  title: string;
  body: string;
}

const MESSAGES: Record<PushMessageKey, Record<AppLanguage, Copy>> = {
  payment_confirmed_table: {
    'pt-BR': { title: 'Pagamento confirmado', body: 'Recebemos o pagamento de {amount} da sua conta.' },
    en: { title: 'Payment confirmed', body: 'We received your payment of {amount} for your tab.' },
    es: { title: 'Pago confirmado', body: 'Recibimos el pago de {amount} de tu cuenta.' },
  },
  payment_confirmed_order: {
    'pt-BR': { title: 'Pagamento confirmado', body: 'Recebemos o pagamento de {amount} do seu pedido.' },
    en: { title: 'Payment confirmed', body: 'We received your payment of {amount} for your order.' },
    es: { title: 'Pago confirmado', body: 'Recibimos el pago de {amount} de tu pedido.' },
  },
  cashback_earned: {
    'pt-BR': {
      title: 'Você ganhou cashback',
      body: '{amount} caíram na sua carteira desse restaurante. Toque pra ver o saldo.',
    },
    en: {
      title: 'You earned cashback',
      body: '{amount} was added to your wallet at this restaurant. Tap to see your balance.',
    },
    es: {
      title: 'Ganaste cashback',
      body: '{amount} llegaron a tu billetera de este restaurante. Toca para ver el saldo.',
    },
  },
  review_prompt: {
    'pt-BR': {
      title: 'Como foi seu pedido?',
      body: 'Sua opinião ajuda outros clientes e o restaurante a melhorar. Toque pra avaliar.',
    },
    en: {
      title: 'How was your order?',
      body: 'Your opinion helps other customers and the restaurant improve. Tap to review.',
    },
    es: {
      title: '¿Cómo fue tu pedido?',
      body: 'Tu opinión ayuda a otros clientes y al restaurante a mejorar. Toca para calificar.',
    },
  },
  verification_approved: {
    'pt-BR': { title: 'Você foi verificado!', body: 'Seu perfil agora tem o selo de cliente verificado. Toque pra ver.' },
    en: { title: 'You are verified!', body: 'Your profile now has the verified customer badge. Tap to see it.' },
    es: { title: '¡Estás verificado!', body: 'Tu perfil ahora tiene la insignia de cliente verificado. Toca para verla.' },
  },
  verification_rejected: {
    'pt-BR': { title: 'Sua verificação não foi aprovada', body: '{reason}. Você pode tentar de novo.' },
    en: { title: 'Your verification was not approved', body: '{reason}. You can try again.' },
    es: { title: 'Tu verificación no fue aprobada', body: '{reason}. Puedes intentarlo de nuevo.' },
  },
  verification_expired: {
    'pt-BR': {
      title: 'Sua verificação expirou',
      body: 'O prazo de análise terminou sem decisão. Você pode tentar de novo.',
    },
    en: {
      title: 'Your verification expired',
      body: 'The review period ended without a decision. You can try again.',
    },
    es: {
      title: 'Tu verificación venció',
      body: 'El plazo de revisión terminó sin una decisión. Puedes intentarlo de nuevo.',
    },
  },
  verification_revoked: {
    'pt-BR': {
      title: 'Sua verificação foi revogada',
      body: 'O estabelecimento revogou seu selo de verificado. Motivo: {reason}',
    },
    en: {
      title: 'Your verification was revoked',
      body: 'The establishment revoked your verified badge. Reason: {reason}',
    },
    es: {
      title: 'Tu verificación fue revocada',
      body: 'El establecimiento revocó tu insignia de verificado. Motivo: {reason}',
    },
  },
  loyalty_reward: {
    'pt-BR': {
      title: 'Prêmio de fidelidade liberado!',
      body: 'Você completou seu cartão fidelidade. Toque pra ver o cupom.',
    },
    en: { title: 'Loyalty reward unlocked!', body: 'You completed your loyalty card. Tap to see the coupon.' },
    es: {
      title: '¡Premio de fidelidad liberado!',
      body: 'Completaste tu tarjeta de fidelidad. Toca para ver el cupón.',
    },
  },
  loyalty_stamp: {
    'pt-BR': {
      title: 'Você ganhou um carimbo',
      body: '{count} de {required} carimbos no seu cartão fidelidade.',
    },
    en: { title: 'You earned a stamp', body: '{count} of {required} stamps on your loyalty card.' },
    es: { title: 'Ganaste un sello', body: '{count} de {required} sellos en tu tarjeta de fidelidad.' },
  },
  new_promotion: {
    'pt-BR': { title: 'Nova promoção!', body: '{text}' },
    en: { title: 'New promotion!', body: '{text}' },
    es: { title: '¡Nueva promoción!', body: '{text}' },
  },
  cashback_expiring_2d: {
    'pt-BR': {
      title: 'Seu cashback vence em 2 dias',
      body: '{amount} de cashback expiram em até 2 dias. Use no próximo pedido!',
    },
    en: {
      title: 'Your cashback expires in 2 days',
      body: '{amount} of cashback expires within 2 days. Use it on your next order!',
    },
    es: {
      title: 'Tu cashback vence en 2 días',
      body: '{amount} de cashback vencen en hasta 2 días. ¡Úsalo en tu próximo pedido!',
    },
  },
  cashback_expiring_7d: {
    'pt-BR': {
      title: 'Seu cashback vence em 1 semana',
      body: '{amount} de cashback expiram em até 7 dias. Aproveite antes que acabe!',
    },
    en: {
      title: 'Your cashback expires in 1 week',
      body: '{amount} of cashback expires within 7 days. Enjoy it before it ends!',
    },
    es: {
      title: 'Tu cashback vence en 1 semana',
      body: '{amount} de cashback vencen en hasta 7 días. ¡Aprovéchalo antes de que termine!',
    },
  },
  order_preparing: {
    'pt-BR': { title: 'Seu pedido está sendo preparado', body: 'A cozinha já começou a preparar seu pedido.' },
    en: { title: 'Your order is being prepared', body: 'The kitchen has started preparing your order.' },
    es: { title: 'Tu pedido se está preparando', body: 'La cocina ya empezó a preparar tu pedido.' },
  },
  order_ready_delivery: {
    'pt-BR': { title: 'Seu pedido está pronto', body: 'Já vai sair para entrega a qualquer momento.' },
    en: { title: 'Your order is ready', body: 'It will head out for delivery any moment now.' },
    es: { title: 'Tu pedido está listo', body: 'Saldrá a entrega en cualquier momento.' },
  },
  order_ready_table: {
    'pt-BR': { title: 'Seu pedido está pronto', body: 'O garçom já está levando pra sua mesa.' },
    en: { title: 'Your order is ready', body: 'The waiter is already bringing it to your table.' },
    es: { title: 'Tu pedido está listo', body: 'El mesero ya lo está llevando a tu mesa.' },
  },
  order_ready_pickup: {
    'pt-BR': { title: 'Seu pedido está pronto', body: 'Pode vir buscar no balcão.' },
    en: { title: 'Your order is ready', body: 'You can come pick it up at the counter.' },
    es: { title: 'Tu pedido está listo', body: 'Puedes venir a recogerlo en el mostrador.' },
  },
  order_done_delivery: {
    'pt-BR': { title: 'Seu pedido foi entregue', body: 'Bom apetite! Toque para ver o cupom.' },
    en: { title: 'Your order was delivered', body: 'Enjoy your meal! Tap to see the receipt.' },
    es: { title: 'Tu pedido fue entregado', body: '¡Buen provecho! Toca para ver el cupón.' },
  },
  order_done_table: {
    'pt-BR': { title: 'Pedido servido', body: 'Bom apetite! Toque para ver o cupom.' },
    en: { title: 'Order served', body: 'Enjoy your meal! Tap to see the receipt.' },
    es: { title: 'Pedido servido', body: '¡Buen provecho! Toca para ver el cupón.' },
  },
  order_done_pickup: {
    'pt-BR': { title: 'Pedido retirado', body: 'Bom apetite! Toque para ver o cupom.' },
    en: { title: 'Order picked up', body: 'Enjoy your meal! Tap to see the receipt.' },
    es: { title: 'Pedido retirado', body: '¡Buen provecho! Toca para ver el cupón.' },
  },
};

// Motivos de recusa da verificação (lista fechada do admin) nos 3 idiomas.
const REJECTION_REASONS: Record<string, Record<AppLanguage, string>> = {
  foto_sem_rosto_claro: {
    'pt-BR': 'A foto não mostra seu rosto claramente',
    en: 'The photo does not clearly show your face',
    es: 'La foto no muestra tu rostro con claridad',
  },
  foto_baixa_qualidade: {
    'pt-BR': 'A foto está com qualidade baixa (borrada, escura ou cortada)',
    en: 'The photo is low quality (blurry, dark or cropped)',
    es: 'La foto tiene baja calidad (borrosa, oscura o recortada)',
  },
  suspeita_falsificacao: {
    'pt-BR': 'A foto parece ser de uma tela, impressão ou imagem da internet',
    en: 'The photo looks like a screen, a printout or an internet image',
    es: 'La foto parece ser de una pantalla, una impresión o una imagen de internet',
  },
  nao_condiz_com_perfil: {
    'pt-BR': 'A foto não parece condizer com o restante do seu perfil',
    en: 'The photo does not seem to match the rest of your profile',
    es: 'La foto no parece coincidir con el resto de tu perfil',
  },
  multiplas_pessoas: {
    'pt-BR': 'A foto mostra mais de uma pessoa',
    en: 'The photo shows more than one person',
    es: 'La foto muestra a más de una persona',
  },
  outro_motivo: { 'pt-BR': 'Outro motivo', en: 'Another reason', es: 'Otro motivo' },
};

export function translateRejectionReason(reasonKey: string, lang: AppLanguage): string {
  const entry = REJECTION_REASONS[reasonKey];
  return entry ? entry[lang] ?? entry[DEFAULT_LANGUAGE] : reasonKey;
}

function interpolate(template: string, params: PushParams): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

export function renderPushMessage(key: PushMessageKey, lang: AppLanguage, params: PushParams = {}): Copy {
  const entry = MESSAGES[key];
  const copy = entry[lang] ?? entry[DEFAULT_LANGUAGE];
  return { title: interpolate(copy.title, params), body: interpolate(copy.body, params) };
}

export const PUSH_MESSAGE_KEYS = Object.keys(MESSAGES) as PushMessageKey[];
