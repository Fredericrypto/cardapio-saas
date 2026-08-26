// Este arquivo existia como hook standalone (uma cópia de estado por
// componente que chamasse `useCustomerAuth(tenantId)`). Foi substituído
// por um Context único (`contexts/CustomerAuthContext.tsx`) — ver o
// comentário lá para o motivo (era a causa real de esgotar o rate
// limit do backend em uso normal). Mantido como re-export por
// compatibilidade, caso algum import antigo tenha sobrado.
export { useCustomerAuth } from '../contexts/CustomerAuthContext';
