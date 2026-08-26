// Gera o payload do "Pix Copia e Cola" / BR Code — o padrão aberto EMV
// usado por todos os bancos brasileiros pra QR codes de Pix estático/
// dinâmico. Não envolve nenhuma API bancária nem gateway de pagamento:
// é só uma string formatada que o app do banco de quem paga sabe
// interpretar pra iniciar a transferência direto pra chave Pix do
// recebedor. O dinheiro nunca passa pela nossa infra.
//
// Referência: manual de padrões do Banco Central (BR Code / Pix).
// Mesmo algoritmo usado em frontend-admin/src/lib/pix.ts (QR mostrado
// pelo admin ao concluir pedido/fechar mesa) — aqui existe uma segunda
// cópia de propósito porque backend e frontend são projetos separados
// sem pacote compartilhado, mas a lógica é idêntica, char por char.

function tlv(id: string, value: string): string {
  const length = value.length.toString().padStart(2, '0');
  return `${id}${length}${value}`;
}

// CRC16-CCITT (polinômio 0x1021, valor inicial 0xFFFF) — exigido no final
// do payload pra validar a integridade quando o app do banco lê o QR.
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Remove acentos e caracteres fora do padrão aceito no payload (o campo
// de nome do recebedor precisa ser ASCII simples, sem acento).
function sanitize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .trim();
}

// txid só aceita alfanumérico, até 25 caracteres — derivamos do próprio
// id do pedido (removendo os hífens do UUID) pra conseguir rastrear/
// conferir depois qual cobrança corresponde a qual pedido.
export function buildPixTxId(orderId: string): string {
  const alnum = orderId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return alnum.slice(0, 25) || '***';
}

export interface PixPayloadParams {
  pixKey: string;
  merchantName: string; // nome do estabelecimento (até 25 caracteres)
  merchantCity: string; // cidade (até 15 caracteres)
  amount: number; // valor da cobrança — sempre calculado no backend, nunca recebido do cliente
  txId: string;
}

export function generatePixPayload({
  pixKey,
  merchantName,
  merchantCity,
  amount,
  txId,
}: PixPayloadParams): string {
  const merchantAccountInfo = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', pixKey);

  const safeName = sanitize(merchantName).slice(0, 25) || 'ESTABELECIMENTO';
  const safeCity = sanitize(merchantCity).slice(0, 15) || 'BRASIL';
  const safeTxId = (txId || '***').slice(0, 25);

  const additionalDataField = tlv('05', safeTxId);

  const payloadWithoutCrc =
    tlv('00', '01') + // Payload Format Indicator
    tlv('26', merchantAccountInfo) + // Merchant Account Information (Pix)
    tlv('52', '0000') + // Merchant Category Code (genérico)
    tlv('53', '986') + // Moeda: Real (BRL)
    tlv('54', amount.toFixed(2)) + // Valor da cobrança
    tlv('58', 'BR') + // País
    tlv('59', safeName) + // Nome do recebedor
    tlv('60', safeCity) + // Cidade do recebedor
    tlv('62', additionalDataField) + // Campo adicional (txid)
    '6304'; // Indica que o CRC16 vem a seguir (4 caracteres)

  return payloadWithoutCrc + crc16(payloadWithoutCrc);
}
