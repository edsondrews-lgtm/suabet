-- Marca como cada aposta foi cadastrada: 'telegram' (via bot) ou 'manual' (formulário do painel).
-- Apostas antigas ficam com origem nula (não dá pra saber com certeza retroativamente).
-- Run in Supabase SQL Editor
ALTER TABLE tipster_apostas ADD COLUMN IF NOT EXISTS origem TEXT;
