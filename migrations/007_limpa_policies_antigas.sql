-- Remove QUALQUER policy pré-existente (inclusive as antigas tipo "Leitura pública",
-- "Admin delete/update" com qual=true que estavam liberando acesso geral) e recria
-- só as regras corretas de dono-apenas.
-- Run in Supabase SQL Editor (no projeto correto: pkpftazklvittlhzdhgz)

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname FROM pg_policies
    WHERE tablename IN ('tipster_apostas','tipster_apostas_detalhes','user_profiles','telegram_vinculos','telegram_messages')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ── tipster_apostas ──
ALTER TABLE tipster_apostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "apostas_select_own" ON tipster_apostas FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "apostas_insert_own" ON tipster_apostas FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "apostas_update_own" ON tipster_apostas FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "apostas_delete_own" ON tipster_apostas FOR DELETE USING (auth.uid() = user_id);

-- ── tipster_apostas_detalhes ──
ALTER TABLE tipster_apostas_detalhes ENABLE ROW LEVEL SECURITY;
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

-- ── telegram_messages ──
ALTER TABLE telegram_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "telegram_msgs_select_own" ON telegram_messages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "telegram_msgs_update_own" ON telegram_messages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "telegram_msgs_delete_own" ON telegram_messages FOR DELETE USING (auth.uid() = user_id);

-- ── user_profiles ──
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_select_own" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON user_profiles FOR UPDATE USING (auth.uid() = id);

-- ── telegram_vinculos ──
ALTER TABLE telegram_vinculos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "vinculos_select_own" ON telegram_vinculos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "vinculos_insert_own" ON telegram_vinculos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "vinculos_delete_own" ON telegram_vinculos FOR DELETE USING (auth.uid() = user_id);
