import { readFileSync } from "fs";
import { join } from "path";

function getGeminiKey() {
  try {
    const envPath = join(process.cwd(), ".env");
    const env = readFileSync(envPath, "utf-8");
    return env.split("\n").find(l => l.startsWith("VITE_GEMINI_API_KEY="))?.split("=")?.slice(1)?.join("=")?.trim();
  } catch {
    return process.env.VITE_GEMINI_API_KEY;
  }
}

const PROMPT = (caption) => `Você está analisando um print de bilhete de aposta esportiva. Pode conter uma ou mais pernas/seleções (aposta simples ou múltipla).

Extraia SOMENTE o que está visível na imagem. Não invente valores — se não der pra ler, retorne null nesse campo.

Além da imagem, você recebe também o texto da legenda que acompanhou o envio (pode estar vazio). A legenda às vezes contém o valor da stake (ex: "STAKE 1.5") e a casa de apostas (ex: "22BET"). Use a legenda só para preencher "stake_unidades" e "casa_aposta" — não use a legenda para inventar dados de jogo/mercado, esses vêm só da imagem.

Legenda recebida: "${caption}"

Responda APENAS com este JSON, sem texto extra, sem markdown:
{
  "data": "YYYY-MM-DD ou null",
  "casa_aposta": "string ou null",
  "stake_unidades": number ou null,
  "tipo": "simples" ou "multipla",
  "odd_total": number,
  "pernas": [
    {
      "esporte": "string",
      "campeonato": "string",
      "jogo": "Time A x Time B",
      "mercado": "string",
      "selecao": "string",
      "odd_parcial": number
    }
  ]
}

Regras:
- "tipo" é "multipla" se houver mais de uma perna, senão "simples".
- Se "odd_total" não estiver escrito em lugar nenhum da imagem, calcule multiplicando todas as odd_parcial das pernas.
- Datas em DD.MM.YYYY devem virar YYYY-MM-DD.
- "jogo" sempre no formato "Time A x Time B".`;

export async function extrairBilhete(imagemBase64, mimeType, captionTexto = "") {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error("VITE_GEMINI_API_KEY não configurada");

  const caption = captionTexto || "";

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { inline_data: { mime_type: mimeType, data: imagemBase64 } },
            { text: PROMPT(caption) },
          ],
        }],
        generationConfig: { temperature: 0, response_mime_type: "application/json" },
      }),
    }
  );

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Gemini erro ${res.status}`);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return JSON.parse(text);
}
