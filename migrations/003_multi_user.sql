-- Multi-user tables and columns
-- Run in Supabase SQL Editor

-- 1. Tabela de perfis de usuário
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL DEFAULT '',
  banca_inicial NUMERIC NOT NULL DEFAULT 1000,
  moeda TEXT NOT NULL DEFAULT 'BRL',
  telegram_chat_id BIGINT UNIQUE,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Tabela de vinculação Telegram
CREATE TABLE IF NOT EXISTS telegram_vinculos (
  chat_id BIGINT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Colunas user_id nas tabelas existentes
ALTER TABLE tipster_apostas ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE tipster_apostas_detalhes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE telegram_messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. Políticas RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE telegram_vinculos ENABLE ROW LEVEL SECURITY;

-- user_profiles: cada um vê o seu, admin vê todos
CREATE POLICY "users_select_own" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON user_profiles FOR UPDATE USING (auth.uid() = id);

-- telegram_vinculos
CREATE POLICY "vinculos_select_own" ON telegram_vinculos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "vinculos_insert_own" ON telegram_vinculos FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 5. Vincular admin (edsondrews) ao chat_id existente
INSERT INTO telegram_vinculos (chat_id, user_id)
SELECT telegram_chat_id, id FROM user_profiles WHERE telegram_chat_id IS NOT NULL
ON CONFLICT (chat_id) DO NOTHING;
