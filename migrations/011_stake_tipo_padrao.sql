-- Preferencia por usuario de como registrar o stake por padrao (valor fixo
-- ou % da banca/unidades), configuravel em "Meu perfil". Padrao: valor.
-- Run in Supabase SQL Editor
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS stake_tipo_padrao TEXT NOT NULL DEFAULT 'valor';
