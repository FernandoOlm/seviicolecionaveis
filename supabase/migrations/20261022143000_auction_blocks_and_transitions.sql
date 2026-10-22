-- Suporte a Blocos de Leilão, Intervalo Configurável de Lotes e Ações/Transições entre Blocos
ALTER TABLE public.auction_items
  ADD COLUMN IF NOT EXISTS block_number INT NOT NULL DEFAULT 1;

ALTER TABLE public.auctions
  ADD COLUMN IF NOT EXISTS item_delay_seconds INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS block_delay_seconds INT NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS block_actions JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Índice para ordenação eficiente por leilão, bloco e sequência do lote
CREATE INDEX IF NOT EXISTS auction_items_block_seq_idx ON public.auction_items(auction_id, block_number, sequence);
