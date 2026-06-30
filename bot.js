import TelegramBot from "node-telegram-bot-api";
import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";
import { extrairBilhete } from "./lib/extrairBilhete.js";

const env = readFileSync(".env", "utf-8");
const get = (key) => env.split("\n").find(l => l.startsWith(key + "="))?.split("=")?.slice(1)?.join("=")?.trim();

const token = get("TELEGRAM_BOT_TOKEN");
const supabase = createClient(get("VITE_SUPABASE_URL"), get("VITE_SUPABASE_ANON_KEY"));

if (!token) { console.error("TELEGRAM_BOT_TOKEN não encontrado"); process.exit(1); }

const bot = new TelegramBot(token, { polling: true });
console.log("Bot rodando... envie uma mensagem ou foto no Telegram");

async function baixarFoto(fileId) {
  const file = await bot.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  const ext = file.file_path.split(".").pop();
  const mimeType = ext === "png" ? "image/png" : "image/jpeg";
  return { base64: buffer.toString("base64"), mimeType };
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const nome = msg.from?.first_name || msg.from?.username || "Desconhecido";
  const caption = msg.caption || "";
  const texto = msg.text || caption || null;

  let fotoFileId = null;
  let dadosExtraidos = null;
  let statusExtracao = "nao_processado";

  if (msg.photo) {
    fotoFileId = msg.photo[msg.photo.length - 1].file_id;
    statusExtracao = "processando";

    try {
      const { base64, mimeType } = await baixarFoto(fotoFileId);
      dadosExtraidos = await extrairBilhete(base64, mimeType, caption);
      statusExtracao = "extraido";
      console.log(`[EXTRAIDO] ${nome}: ${dadosExtraidos.pernas?.length ?? 0} perna(s), odd ${dadosExtraidos.odd_total}`);
    } catch (err) {
      statusExtracao = "erro_extracao";
      console.error(`[ERRO] ${nome}: ${err.message}`);
    }
  }

  const { error } = await supabase.from("telegram_messages").insert({
    chat_id: chatId,
    nome,
    texto,
    foto_file_id: fotoFileId,
    dados_extraidos: dadosExtraidos,
    status_extracao: statusExtracao,
    status: "pendente",
  });

  if (error) console.error("Erro DB:", error.message);
  else console.log(`[OK] ${nome}: ${texto || "(foto)"}`);
});
