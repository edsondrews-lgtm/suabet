-- Regras de segurança reais (RLS) — cada usuário só acessa os próprios dados, sem exceção.
-- O bot/webhook usa a service_role key (bypassa RLS) para gravar em nome de qualquer usuário.
-- Run in Supabase SQL Editor

-- ── tipster_apostas ──
ALTER TABLE tipster_apostas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "apostas_select_own" ON tipster_apostas;
DROP POLICY IF EXISTS "apostas_insert_own" ON tipster_apostas;
DROP POLICY IF EXISTS "apostas_update_own" ON tipster_apostas;
DROP POLICY IF EXISTS "apostas_delete_own" ON tipster_apostas;
CREATE POLICY "apostas_select_own" ON tipster_apostas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "apostas_insert_own" ON tipster_apostas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "apostas_update_own" ON tipster_apostas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "apostas_delete_own" ON tipster_apostas FOR DELETE USING (auth.uid() = user_id);

-- ── tipster_apostas_detalhes (segue o dono da aposta) ──
ALTER TABLE tipster_apostas_detalhes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "detalhes_select_own" ON tipster_apostas_detalhes;
DROP POLICY IF EXISTS "detalhes_insert_own" ON tipster_apostas_detalhes;
DROP POLICY IF EXISTS "detalhes_update_own" ON tipster_apostas_detalhes;
DROP POLICY IF EXISTS "detalhes_delete_own" ON tipster_apostas_detalhes;
CREATE POLICY "detalhes_select_own" ON tipster_apostas_detalhes FOR SELECT USING (
  EXISTS (SELECT 1 FROM tipster_apostas a WHERE a.id = aposta_id AND a.user_id = auth.uid())
);
CREATE POLICY "detalhes_insert_own" ON tipster_apostas_detalhes FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM tipster_apostas a WHERE a.id = aposta_id AND a.user_id = auth.uid())
);
CREATE POLICY "detalhes_update_own" ON tipster_apostas_detalhes FOR UPDATE USING (
  EXISTS (SELECT 1 FROM tipster_apostas a WHERE a.id = aposta_id AND a.user_id = auth.uid())
);
CREATE POLICY "detalhes_delete_own" ON tipster_apostas_detalhes FOR DELETE USING (
  EXISTS (SELECT 1 FROM tipster_apostas a WHERE a.id = aposta_id AND a.user_id = auth.uid())
);

-- ── telegram_messages (só o bot, via service_role, insere; o dono lê/atualiza/apaga) ──
ALTER TABLE telegram_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "telegram_msgs_select_own" ON telegram_messages;
DROP POLICY IF EXISTS "telegram_msgs_update_own" ON telegram_messages;
DROP POLICY IF EXISTS "telegram_msgs_delete_own" ON telegram_messages;
CREATE POLICY "telegram_msgs_select_own" ON telegram_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "telegram_msgs_update_own" ON telegram_messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "telegram_msgs_delete_own" ON telegram_messages FOR DELETE USING (auth.uid() = user_id);

-- ── user_profiles (reforça as regras já existentes) ──
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users_select_own" ON user_profiles;
DROP POLICY IF EXISTS "users_insert_own" ON user_profiles;
DROP POLICY IF EXISTS "users_update_own" ON user_profiles;
CREATE POLICY "users_select_own" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON user_profiles FOR UPDATE USING (auth.uid() = id);

-- ── telegram_vinculos (reforça + adiciona DELETE, que faltava pro botão "Desvincular") ──
ALTER TABLE telegram_vinculos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vinculos_select_own" ON telegram_vinculos;
DROP POLICY IF EXISTS "vinculos_insert_own" ON telegram_vinculos;
DROP POLICY IF EXISTS "vinculos_delete_own" ON telegram_vinculos;
CREATE POLICY "vinculos_select_own" ON telegram_vinculos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "vinculos_insert_own" ON telegram_vinculos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vinculos_delete_own" ON telegram_vinculos FOR DELETE USING (auth.uid() = user_id);
