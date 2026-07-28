interface EvolutionConfig {
  apiUrl: string;
  apiKey: string;
  instanceName: string;
}

interface SendWhatsappTextInput {
  phone: string;
  text: string;
}

function getEvolutionConfig(): EvolutionConfig | null {
  const apiUrl = process.env.EVOLUTION_API_URL;
  const apiKey = process.env.EVOLUTION_API_KEY;
  const instanceName = process.env.EVOLUTION_API_INSTANCE_NAME;

  if (!apiUrl || !apiKey || !instanceName) return null;
  return { apiUrl, apiKey, instanceName };
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("57") ? digits : `57${digits}`;
}

export async function sendWhatsappText(input: SendWhatsappTextInput): Promise<void> {
  const config = getEvolutionConfig();
  if (!config) {
    throw new Error("Evolution API no está configurada. Revisa EVOLUTION_API_URL, EVOLUTION_API_KEY y EVOLUTION_API_INSTANCE_NAME.");
  }

  const endpoint = `${config.apiUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(config.instanceName)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: config.apiKey },
    body: JSON.stringify({ number: normalizePhone(input.phone), text: input.text, delay: 0 }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 180);
    throw new Error(`Evolution API rechazó el mensaje (${response.status})${detail ? `: ${detail}` : ""}`);
  }
}
