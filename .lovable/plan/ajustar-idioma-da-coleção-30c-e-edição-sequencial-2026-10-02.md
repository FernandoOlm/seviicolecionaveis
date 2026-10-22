# Ajustar idioma da coleção 30C e edição sequencial

## O que será feito

1. Alterar para **Português** o idioma de todas as cartas da coleção `30C - Celebração de 30 Anos`, sem mudar estoque, preço, imagem ou demais dados.
2. Na edição completa de uma carta, adicionar o botão **Salvar e ir p/ próxima** ao lado do botão atual.
3. Ao usar esse botão, salvar normalmente e abrir a próxima carta da lista filtrada na edição completa; ao chegar ao fim, informar que não há próxima carta.
4. Validar a quantidade e o idioma das cartas alteradas e conferir o funcionamento do painel.

## Detalhes técnicos

- A atualização do idioma será aplicada diretamente aos registros existentes da coleção.
- O novo botão reutilizará as mesmas validações e atualização do botão atual, evitando duas lógicas de salvamento.
- A ordem respeitará os filtros e a ordenação já exibidos em **Cartas cadastradas**.
