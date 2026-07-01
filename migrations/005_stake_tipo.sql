-- Permite registrar o stake como % da banca (unidades) ou como valor fixo na moeda
-- Run in Supabase SQL Editor
ALTER TABLE tipster_apostas ADD COLUMN IF NOT EXISTS stake_tipo TEXT NOT NULL DEFAULT 'unidades';
