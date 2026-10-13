import { useState } from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import { useI18n } from '../../i18n/I18nContext';
import {
  detectBrand,
  formatCardNumber,
  formatExpiry,
  luhnValid,
  maskNumber,
  maxCardDigits,
  onlyDigits,
} from '../../lib/cardBrand';
import { CART_TEXT_ERROR, CART_TEXT_MUTED, CART_TEXT_SUCCESS } from '../../lib/cartTheme';
import { Tooltip } from '../Tooltip';
import { CardBrandLogo } from './CardBrandLogo';
import { CartSegmented } from './CartSegmented';
import { CartTextField } from './CartField';

interface CardPreviewProps {
  primaryColor: string;
}

type CardKind = 'credit' | 'debit';

const NAME_MAX = 26;

// Cartão ILUSTRATIVO da etapa "Pagamento" (método "cartao").
//
// SEGURANÇA — inegociável: hoje o cartão é pago na MAQUININHA, na entrega ou
// retirada; o app não processa pagamento. Por isso o que se digita aqui:
//  - vive SÓ no estado local deste componente (useState): nunca vai para
//    createOrder/API, localStorage, sessionStorage, contexto, URL, console ou
//    analytics;
//  - some quando o componente desmonta (sair da etapa ou trocar de método);
//  - não é exigido para avançar: o botão "Revisar pedido" não depende destes
//    campos (a CartPage nem recebe esses valores);
//  - usa autoComplete="off" e `name` fora do padrão, para o navegador não
//    oferecer salvar nem preencher (alguns navegadores podem ignorar o off).
// Não há campo de CVV de propósito.
export function CardPreview({ primaryColor }: CardPreviewProps) {
  const { t } = useI18n();
  const [digits, setDigits] = useState('');
  const [holder, setHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [kind, setKind] = useState<CardKind>('credit');

  const brand = detectBrand(digits);
  const numberMasked = maskNumber(digits, brand);
  const numberField = formatCardNumber(digits, brand);

  // Estado visual sutil, nunca bloqueia: válido (Luhn ok com 13+ dígitos) ou
  // inválido só quando o número já chegou ao tamanho máximo da bandeira.
  const status: 'idle' | 'valid' | 'invalid' =
    digits.length >= 13 && luhnValid(digits)
      ? 'valid'
      : digits.length >= maxCardDigits(brand)
        ? 'invalid'
        : 'idle';

  // Atributos comuns que impedem o navegador/gerenciador de senhas de salvar.
  const noSave = {
    autoComplete: 'off',
    autoCorrect: 'off',
    spellCheck: false,
    'data-lpignore': 'true',
    'data-1p-ignore': 'true',
    'data-form-type': 'other',
  } as const;

  return (
    <div className="flex flex-col gap-4">
      {/* Cartão flutuante: no desktop passa um pouco da borda direita do painel
          (apenas a partir de lg; no celular fica dentro da coluna). */}
      <Tooltip label={t('cartPayment.previewTooltip')} className="block lg:-mr-10">
        <div
          role="img"
          aria-label={t('cartPayment.previewTooltip')}
          className="relative aspect-[1.586/1] w-full rounded-2xl p-5 text-white flex flex-col justify-between overflow-hidden shadow-[0_18px_40px_rgba(0,0,0,0.35)] ring-1 ring-white/10 bg-gradient-to-br from-[#2B3140] via-[#171B24] to-[#0B0D12]"
        >
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -top-16 -right-10 w-48 h-48 rounded-full opacity-25 blur-2xl"
            style={{ backgroundColor: primaryColor }}
          />
          <div className="relative flex items-start justify-between">
            <span className="w-9 h-7 rounded-md bg-gradient-to-br from-[#E5C77A] to-[#B8923A] opacity-90" aria-hidden="true" />
            <span className="text-[11px] font-medium uppercase tracking-wider text-white/70">
              {kind === 'credit' ? t('cartPayment.credit') : t('cartPayment.debit')}
            </span>
          </div>

          <p className="relative font-mono text-[17px] sm:text-lg tracking-[0.14em] whitespace-nowrap tabular-nums">
            {numberMasked}
          </p>

          <div className="relative flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-white/50">{t('cartPayment.cardExpiry')}</p>
              <p className="text-sm tabular-nums">{expiry || t('cartPayment.expiryPlaceholder')}</p>
              <p className="mt-1.5 text-sm uppercase tracking-wide truncate max-w-[12rem]">
                {holder.trim() || <span className="text-white/50">{t('cartPayment.cardName')}</span>}
              </p>
            </div>
            <CardBrandLogo brand={brand} unknownLabel={t('payment.card')} />
          </div>
        </div>
      </Tooltip>

      <CartSegmented<CardKind>
        ariaLabel={t('cartPayment.cardType')}
        primaryColor={primaryColor}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'credit', label: t('cartPayment.credit') },
          { value: 'debit', label: t('cartPayment.debit') },
        ]}
      />

      <div className="flex flex-col gap-3">
        <CartTextField
          label={t('cartPayment.cardNumber')}
          type="text"
          inputMode="numeric"
          name="illustrative-field-1"
          value={numberField}
          invalid={status === 'invalid'}
          placeholder="0000 0000 0000 0000"
          onChange={(e) => {
            const raw = onlyDigits(e.target.value);
            setDigits(raw.slice(0, maxCardDigits(detectBrand(raw))));
          }}
          {...noSave}
        />
        {status !== 'idle' && (
          <p
            role="status"
            className={`-mt-1.5 flex items-center gap-1.5 text-[11px] ${status === 'valid' ? CART_TEXT_SUCCESS : CART_TEXT_ERROR}`}
          >
            {status === 'valid' && <Check size={12} strokeWidth={1.5} aria-hidden="true" />}
            {status === 'valid' ? t('cartPayment.numberValid') : t('cartPayment.numberInvalid')}
          </p>
        )}

        <CartTextField
          label={t('cartPayment.cardName')}
          type="text"
          name="illustrative-field-2"
          value={holder}
          maxLength={NAME_MAX}
          placeholder={t('cartPayment.cardName')}
          onChange={(e) => setHolder(e.target.value.slice(0, NAME_MAX))}
          style={{ textTransform: 'uppercase' }}
          {...noSave}
        />

        <CartTextField
          label={t('cartPayment.cardExpiry')}
          type="text"
          inputMode="numeric"
          name="illustrative-field-3"
          value={expiry}
          placeholder={t('cartPayment.expiryPlaceholder')}
          onChange={(e) => setExpiry(formatExpiry(e.target.value))}
          {...noSave}
        />
      </div>

      <p className={`flex items-start gap-1.5 text-[11px] leading-relaxed ${CART_TEXT_MUTED}`}>
        <ShieldCheck size={13} strokeWidth={1.5} aria-hidden="true" className="shrink-0 mt-0.5" />
        {t('cartPage.maquininha_na_entrega_retirada')} {t('cartPayment.illustrativeNote')}
      </p>
    </div>
  );
}
