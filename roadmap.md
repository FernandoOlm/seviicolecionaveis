# Confirmações de agendamento
## Confirmação de recebimento pelo comprador
- [x] Botão discreto e confirmação acessível; Cancelar, X, Esc e clique fora verificados, sem alteração.
- [x] Validação de dono/status com atualização atômica, data/hora/usuário persistidos e visíveis no admin.
- [x] Aviso à loja enviado, 12 testes passando e fluxo autenticado verificado em celular/computador com pedido temporário sem cobrança.
## Status de pedidos
- [x] Adicionar os três status ao painel e ao acompanhamento, preservando pagamento e estoque; testes passando e opções verificadas no painel autenticado.

- [x] E-mail da loja configurável no painel.
- [x] Confirmação de entrega/retirada para cliente e loja, com dados do pedido após pagamento confirmado.
- [x] Link de criação rápida no Google Calendar no e-mail da loja.
- [x] Testes de envio/dados e leitura autenticada no painel.
- [ ] Destinatário da loja: aguarda preenchimento em Admin → E-mails.
- [ ] Confirmar recebimento real: aguarda pedido agendado pago; nenhum pedido desse tipo existe ainda.
## Hub de Eventos (Retirada em eventos)
- [x] Tabela de eventos + vínculo no pedido e na ordem de serviço (pilha).
- [x] Admin /admin/eventos: criar/editar/desativar/excluir, lista + calendário, pedidos por evento com impressão, aviso com contagem de pedidos e e-mail aos clientes.
- [x] Calendário de eventos no checkout e na Pilha (dias em azul, blocos de 1h, fecha 24h antes, validado no servidor).
- [x] Confirmações por e-mail (cliente + loja com Google Calendar) para agendamentos de evento.
- [x] Reabertura às 10h do dia seguinte ao fim do evento (cron diário 13h01 UTC), histórico "Não compareceu", e-mail com WhatsApp, reagendamento na página do pedido (retirada em mãos ou outro evento).
- [x] Testado no navegador: evento criado no admin aparece no checkout com dia e horários.
- [ ] Publicar o site para valer em produção.
