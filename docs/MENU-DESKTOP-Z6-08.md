# Menu (MenuPage) — refatoração do layout desktop e tema escuro (z6-08)

Escopo: SOMENTE a página do Cardápio e seus componentes (frontend-cardapio).
Nenhuma outra página, nenhum backend, nenhuma migration.

## Arquivos
- NOVO `lib/menuTheme.ts` — paleta única (par claro/escuro explícito em hex). Claro = cores originais;
  escuro = paleta do projeto (#131314 fundo, #1E1E20 superfície, #282A2C nível 2, #E3E2E6 / #C4C7C5 / #8E918F texto).
- `components/MenuHeader.tsx`, `TableMenuHeader.tsx` — desktop vira UM cartão encapsulado (banner baixo + corpo);
  celular mantém banner + sheet. MenuHeader: Voltar com rótulo no desktop, indicador/seletor de unidade
  (só desktop; com mais de uma unidade leva à escolha de loja), cartão de entrega com divisor.
- `components/RestaurantInfoPanel.tsx` — desktop em colunas (endereço | horário | redes + telefone), redes
  geradas de uma lista única, telefone mostrado formatado (o link `tel:` usa o número original).
- `components/CartBar.tsx` — cartão flutuante (sacola + itens + total + seta), anel fino no escuro.
- `components/SearchBar.tsx`, `PromoCards.tsx`, `ProductCard.tsx`, `CategoryChips.tsx`, `HeaderStatus.tsx`,
  `pages/MenuPage.tsx` — todas as superfícies/textos passam pela paleta; no desktop o conteúdo alinha
  com as bordas do cabeçalho (`md:px-0` dentro do container `max-w-7xl md:px-8`).

## Regras
- Cor nova no Menu: constante de `lib/menuTheme.ts` (ou par `bg-[#hex] dark:bg-[#hex]`), nunca `bg-white` solto.
- Selos/pílulas SOBRE foto (Promoção, contagem regressiva, "Você já usou") continuam brancos de propósito.
- Sem texto novo: nenhuma chave de i18n foi criada (indicador de unidade usa só o nome e o ícone).

## Não validado em ambiente real
Navegador (claro e escuro, 1280/1440/1920 px e celular), Vercel, `DesktopNav`/`BottomNav`/`QrScanButton`/`BrandIcons`
(não faziam parte dos arquivos recebidos).
