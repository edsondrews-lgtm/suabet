import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = process.env;
  if (!VITE_SUPABASE_URL) return res.status(500).json({ error: "Supabase not configured" });

  const supabase = createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY);
  const update = req.body;

  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const nome = msg.from?.first_name || msg.from?.username || "Desconhecido";
    const texto = msg.text || null;
    const foto = msg.photo ? msg.photo[msg.photo.length - 1].file_id : null;

    console.log(`[TG] chat_id: ${chatId} | nome: ${nome} | texto: ${texto || "(foto)"}`);

    await supabase.from("telegram_messages").insert({
      chat_id: chatId, nome, texto, foto_file_id: foto, status: "pendente",
    });
  }

  return res.status(200).json({ ok: true });
}
