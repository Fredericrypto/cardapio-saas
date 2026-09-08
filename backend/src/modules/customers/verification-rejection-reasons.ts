// Lista FECHADA de propósito — o admin é obrigado a escolher um destes,
// nunca texto livre (pedido explícito do Felipe: "obrigado a escolher um
// motivo em uma lista predefinida"). O mesmo texto que o admin vê nessa
// lista é EXATAMENTE o que aparece pro cliente depois — por isso a
// redação já é em tom direto ao cliente, não uma nota interna.
export const VERIFICATION_REJECTION_REASONS = [
  'foto_sem_rosto_claro',
  'foto_baixa_qualidade',
  'suspeita_falsificacao',
  'nao_condiz_com_perfil',
  'multiplas_pessoas',
  'outro_motivo',
] as const;

export type VerificationRejectionReason = (typeof VERIFICATION_REJECTION_REASONS)[number];

export const VERIFICATION_REJECTION_REASON_LABELS: Record<VerificationRejectionReason, string> = {
  foto_sem_rosto_claro: 'A foto não mostra seu rosto claramente',
  foto_baixa_qualidade: 'A foto está com qualidade baixa (borrada, escura ou cortada)',
  suspeita_falsificacao: 'A foto parece ser de uma tela, impressão ou imagem da internet',
  nao_condiz_com_perfil: 'A foto não parece condizer com o restante do seu perfil',
  multiplas_pessoas: 'A foto mostra mais de uma pessoa',
  outro_motivo: 'Outro motivo',
};
