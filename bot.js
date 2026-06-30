import TelegramBot from "node-telegram-bot-api";
import { readFileSync } from "fs";
import { join } from "path";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(".env", "utf-8");
const get = (key) => env.split("\n").find(l => l.startsWith(key + "="))?.split("=")?.slice(1)?.join("=")?.trim();

const token = get("TELEGRAM_BOT_TOKEN");
const supabase = createClient(get("VITE_SUPABASE_URL"), get("VITE_SUPABASE_ANON_KEY"));

if (!token) { console.error("TELEGRAM_BOT_TOKEN não encontrado"); process.exit(1); }

const bot = new TelegramBot(token, { polling: true });
console.log("Bot rodando... envie uma mensagem no Telegram");

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const nome = msg.from?.first_name || msg.from?.username || "Desconhecido";
  const texto = msg.text || null;
  const foto = msg.photo ? msg.photo[msg.photo.length - 1].file_id : null;

  const { error } = await supabase.from("telegram_messages").insert({
    chat_id: chatId, nome, texto, foto_file_id: foto, status: "pendente",
  });

  if (error) console.error("Erro:", error.message);
  else console.log(`[OK] ${nome}: ${texto || "(foto)"}`);
});
