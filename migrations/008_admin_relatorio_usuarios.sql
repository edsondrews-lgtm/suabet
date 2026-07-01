-- Permite que o admin (e só o admin, verificado no banco) leia todos os
-- perfis e apostas, pra montar o relatório de usuários cadastrados.
-- Escrita (insert/update/delete) continua restrita ao dono, sem exceção.
-- Run in Supabase SQL Editor

CREATE OR REPLACE FUNCTION is_admin() RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role = 'admin');
$$;

DROP POLICY IF EXISTS "users_select_own" ON user_profiles;
CREATE POLICY "users_select_own_or_admin" ON user_profiles FOR SELECT USING (auth.uid() = id OR is_admin());

DROP POLICY IF EXISTS "apostas_select_own" ON tipster_apostas;
CREATE POLICY "apostas_select_own_or_admin" ON tipster_apostas FOR SELECT USING (auth.uid() = user_id OR is_admin());
