# Várias fotos por item do cardápio (até 5)

Entregue em 13/10/2026. Vale só para ITENS do cardápio; promoções seguem com a
imagem única (`PromoCards` / `PromotionDetailPage` não foram tocados).

## Modelo de dados (decisão de compatibilidade)

- `products.images text[] NOT NULL DEFAULT '{}'` — galeria ordenada (fonte da verdade).
- `products.image_url` **continua existindo e é sempre a capa = `images[0]`**. Fallback
  de imagem da promoção, avaliações, miniatura do carrinho e og:image do link
  compartilhado dependem dela e seguem funcionando sem mudança.
- `CHECK (cardinality(images) <= 5)` (`CHK_products_images_max_5`): o limite vale no banco.
- Migration `1757400000000-ProductImagesGallery`: cria a coluna, faz backfill
  (`images = {image_url}` para quem já tinha foto, inclusive soft-deleted) e cria o CHECK.
  Idempotente e reversível (o `down` não perde a capa).
- O `DEFAULT '{}'` é obrigatório: o módulo de backup (`checkCompatibility`) recusa
  restaurar arquivos antigos se uma coluna nova for `NOT NULL` sem padrão. Backup
  anterior à galeria volta com `images = {}` + `image_url` preenchida; o service
  normaliza isso em toda leitura (`resolveProductImages`) e o banco se corrige na
  próxima gravação do produto.

## API

| Rota | O que faz |
|---|---|
| `POST /products/:id/images` (multipart, campo `files`, até 5) | **Acrescenta** fotos ao fim da galeria. Valida TODAS antes de subir qualquer uma; recusa (400) se a soma passar de 5; linha do produto travada (`pessimistic_write`) contra envios simultâneos; arquivos já subidos são apagados se a gravação falhar. |
| `PATCH /products/:id` com `images: string[]` | Substitui a galeria inteira, na ordem enviada (reordenar/remover). `[]` remove todas. Máx. 5, URLs http(s), sem repetidas. Tem precedência sobre `imageUrl`. |
| `PATCH /products/:id` com `imageUrl` (formato antigo) | Troca só a capa e mantém as outras fotos. |
| `POST /products/:id/image` (formato antigo) | Igual ao anterior: troca só a capa. |
| Listagem pública e listagem do painel | Passam a devolver `images` (já normalizada). `costPrice` continua `null` no público. |

Permissão: `menu:manage`, como antes. Arquivos removidos da galeria **não** são
apagados do storage (um backup restaurado pode voltar a referenciá-los).

## Painel (admin)

`ProductImagesEditor` dentro de "Editar produto": miniaturas, adicionar várias de uma
vez, remover (confirmação na própria miniatura), reordenar arrastando ou pelas setas,
selo "Capa", contador N/5 e alerta quando passa de 5 / arquivo inválido. Cada ação é
salva na hora (otimista, com rollback se o servidor recusar). A miniatura da lista
agora abre a edição (mostra a quantidade quando há 2+).

## Cardápio do cliente

`ProductImageCarousel` em `ProductCard` e `ProductDetailPage`:
0–1 foto = `<img>` de sempre (sem setas, bolinhas ou timers); 2–5 = slide com loop,
autoplay de 5 s, setas sutis, bolinhas pequenas em fundo translúcido, arrastar com o dedo.
Autoplay pausa com mouse em cima, dedo tocando, foco de teclado, aba oculta, card fora
da tela e "reduzir movimento". No `ProductCard` (que é um `<button>`) as setas são
`<span role="button">`. Animação via Web Animations API (não mexe no `index.css`).

## Testes

- `npm run test:product-images-pure` — regras puras, sem banco.
- `npm run test:product-images` — pure + `product-images-db-audit.ts` (Postgres real:
  migration up/down + backfill, CHECK, capa = primeira foto, corrida de uploads, dado de
  backup antigo, isolamento entre restaurantes, custo fora do público). Entrou no `test:all`.

## Rollout

Backend primeiro (migration roda no deploy/`npm run migration:run`), depois os dois
frontends. Os frontends toleram backend antigo (sem `images`) e itens antigos no
carrinho (`getProductImages` cai em `imageUrl`).
