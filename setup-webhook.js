import { readFileSync } from "fs";
import { join } from "path";

function getTelegramToken() {
  try {
    const envPath = join(process.cwd(), ".env");
    const env = readFileSync(envPath, "utf-8");
    return env.split("\n").find(l => l.startsWith("TELEGRAM_BOT_TOKEN="))?.split("=")[1]?.trim();
  } catch {
    return process.env.TELEGRAM_BOT_TOKEN;
  }
}

const VERCEL_URL = process.argv[2];

if (!VERCEL_URL) {
  console.error("Uso: node setup-webhook.js https://seu-projeto.vercel.app");
  process.exit(1);
}

const token = getTelegramToken();
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN não encontrado");
  process.exit(1);
}

const webhookUrl = `${VERCEL_URL}/api/telegram`;

console.log(`Configurando webhook: ${webhookUrl}`);

const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: webhookUrl }),
});

const data = await res.json();

if (data.ok) {
  console.log("Webhook configurado com sucesso!");
  console.log(`URL: ${webhookUrl}`);
} else {
  console.error("Erro:", data.description);
}
