# Adicionar coleção "30C - Celebração de 30 Anos" (158 cartas)

## O que será feito

1. **Cadastrar as 158 cartas** do novo arquivo SQL enviado (155 Pokémon e 3 Treinador, em inglês, acabamento Normal, condição NM), com estoque 0 e sem preço. Você define preço e estoque depois pelo admin, como de costume.
2. **Adicionar a coleção à lista de coleções do site** para ela aparecer nos filtros e no cadastro de cartas.

O novo arquivo já está com as correções (idioma "Inglês", sem a coluna de ilustrador, nome no padrão "30C - Celebração de 30 Anos") e será usado do jeito que está. Hoje não existe nenhuma carta dessa coleção no site, então não vai duplicar nada.

## Detalhes técnicos

- Executar o SQL do arquivo como está, via run_sql (é inserção de dados, não migration).
- Adicionar `30C - Celebração de 30 Anos` em `EXTRA_COLLECTIONS` em `src/data/cards.ts`.
- `pokemon_type` e `illustrator_id` ficam NULL; podem ser preenchidos depois pelo admin.

## Ressalva sobre as imagens

O próprio arquivo avisa que os links das imagens (TCGdex, `assets.tcgdex.net/en/me/30c/...`) **ainda não foram confirmados** para esta coleção. Depois de inserir, vou testar os links e te aviso se algum estiver quebrado. Nesse caso, as imagens precisarão ser corrigidas depois.
