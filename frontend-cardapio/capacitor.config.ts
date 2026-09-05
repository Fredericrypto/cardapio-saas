import type { CapacitorConfig } from '@capacitor/core';

// Config placeholder — appId no formato reverso-domínio é convenção do
// Android/Play Store, precisa bater com o pacote final quando publicar
// de verdade (não dá pra trocar depois sem virar um app novo na Play
// Store). Troca isso quando o nome definitivo do app existir.
const config: CapacitorConfig = {
  appId: 'com.cardapiosaas.app',
  appName: 'Cardápio SaaS',
  webDir: 'dist',
};

export default config;
