# Handoff — Cardápio SaaS (14/09/2026, sessão I — hotfix)

Complementa `HANDOFF-2026-09-14-I.md` (não substitui — mesma sessão, correção de um bug que a própria entrega I introduziu). Build marker bumped pra `2026-09-14-sessao-i-02`.

## Bug crítico: bloqueio novo travava qualquer mesa por causa de sobra de teste vazia

O reforço do "anti pular de mesa" (item 2 do handoff I) bloqueava **qualquer** sessão aberta em outro lugar, mesmo sem nenhum pedido — e isso incluiu, sem querer, a limpeza automática que já existia (`staleOwnSessions`, mais abaixo no mesmo método) que fecha sozinha uma sessão VAZIA que o próprio cliente tinha aberto em outra mesa. Como o bloqueio novo rodava ANTES dessa limpeza, qualquer sobra de teste do dia (mesa aberta sem pedido, esquecida) travava o Felipe pra sempre — ele nunca conseguia nem chegar na parte que fecharia essa sobra sozinha.

**Corrigido**: o bloqueio duro (sem exceção) agora só vale quando existe PEDIDO de verdade em outro lugar (dinheiro/conta real em jogo) — nesse caso continua travando sempre, exatamente como pedido. Uma sessão vazia que o PRÓPRIO cliente abriu em outra mesa volta a ser fechada automaticamente, sem bloquear nada (como já era antes de 14/09). Se o cliente é PARTICIPANTE (não dono) de uma sessão ativa de outra pessoa, o bloqueio continua valendo sempre, com ou sem pedido — não é dele decidir se está "vazia o suficiente".

## Se ainda aparecer bloqueado depois desse deploy

Pode ser uma sessão de teste de hoje com PEDIDO (não vazia) esquecida aberta em algum lugar — nesse caso o bloqueio é o esperado. Verificar no painel admin se sobrou algum card de mesa/balcão ativo e fechar por lá ("Fechar conta" ou "Encerrar sem cobrar").
