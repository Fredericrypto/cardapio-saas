import axios from 'axios';

// Em produção, isso aponta pro backend no Render.
// Em dev, aponta pro localhost:3000 (o backend NestJS rodando local).
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// `timeout` de propósito: sem isso, uma requisição que trava no
// backend (conexão de banco morta, pool esgotado, etc.) nunca resolve
// NEM rejeita — fica pendurada pra sempre. Como várias telas fazem
// `fetchTenantBySlug(slug).then(setTenant)` sem `.catch`, um travamento
// silencioso vira uma tela de loading infinito, sem nenhum erro visível
// no console pra investigar. 20s é generoso o bastante pra não
// atrapalhar upload de imagem (via `multipart/form-data`, mesmo
// cliente), mas baixo o bastante pra nunca deixar a pessoa achando que
// travou de vez.
export const api = axios.create({
  baseURL: API_URL,
  timeout: 20000,
});
