import { createClient } from "@supabase/supabase-js";
import { extrairBilhete } from "../lib/extrairBilhete.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(200).json({ ok: true });

  const { VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, TELEGRAM_BOT_TOKEN } = process.env;
  if (!VITE_SUPABASE_URL) return res.status(500).json({ error: "Supabase not configured" });

  const supabase = createClient(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const update = req.body;

  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const nome = msg.from?.first_name || msg.from?.username || "Desconhecido";

    // /start handler
    if (msg.text === "/start") {
      const { data: vinculo } = await supabase.from("telegram_vinculos").select("user_id").eq("chat_id", chatId).single();
      const text = vinculo
        ? "✅ Telegram já vinculado! Mande uma foto de bilhete."
        : '👋 Para vincular, acesse o painel web e clique em "Vincular Telegram".';
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text }),
      });
      return res.status(200).json({ ok: true });
    }

    // Find user by chat_id
    const { data: vinculo } = await supabase.from("telegram_vinculos").select("user_id").eq("chat_id", chatId).single();
    const userId = vinculo?.user_id || null;

    const caption = msg.caption || "";
    const texto = msg.text || caption || null;

    let fotoFileId = null;
    let dadosExtraidos = null;
    let statusExtracao = "nao_processado";

    if (msg.photo) {
      fotoFileId = msg.photo[msg.photo.length - 1].file_id;
      statusExtracao = "processando";

      try {
        const fileRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fotoFileId}`);
        const fileData = await fileRes.json();
        const filePath = fileData.result.file_path;

        const imgRes = await fetch(`https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`);
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        const base64 = buffer.toString("base64");
        const mimeType = filePath.endsWith("png") ? "image/png" : "image/jpeg";

        dadosExtraidos = await extrairBilhete(base64, mimeType, caption);
        statusExtracao = "extraido";
      } catch (err) {
        statusExtracao = "erro_extracao";
        console.error(`[ERRO] ${nome}: ${err.message}`);
      }
    }

    await supabase.from("telegram_messages").insert({
      chat_id: chatId,
      user_id: userId,
      nome,
      texto,
      foto_file_id: fotoFileId,
      dados_extraidos: dadosExtraidos,
      status_extracao: statusExtracao,
      status: "pendente",
    });

    const reply = userId
      ? "✅ Bilhete recebido e processado!"
      : "⚠️ Foto recebida, mas seu Telegram não está vinculado. Acesse o painel web para vincular.";
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: reply }),
    });
  }

  return res.status(200).json({ ok: true });
}
