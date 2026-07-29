export const DEFAULT_WHATSAPP_MESSAGE_TEMPLATE = "Hola {{nombre}}, soy tu asesor. Gracias por visitarnos; te escribo para seguir con la información de tu {{carro}}.";
export const WHATSAPP_MESSAGE_TEMPLATE_COOKIE = "leadflow_whatsapp_message_template";
export const WHATSAPP_TEMPLATE_VARIABLES = ["nombre", "numero", "carro", "nombre_vendedor", "correo_vendedor", "empresa_vendedor", "numero_vendedor"] as const;

export const WHATSAPP_TEMPLATE_VARIABLE_LABELS: Record<WhatsappTemplateVariable, string> = {
  nombre: "Nombre del cliente",
  numero: "Celular del cliente",
  carro: "Carro interesado",
  nombre_vendedor: "Nombre del vendedor",
  correo_vendedor: "Correo del vendedor",
  empresa_vendedor: "Empresa del vendedor",
  numero_vendedor: "Celular del vendedor",
};

export type WhatsappTemplateVariable = (typeof WHATSAPP_TEMPLATE_VARIABLES)[number];

export function getUnknownWhatsappTemplateVariables(template: string): string[] {
  const variables = [...template.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].map((match) => match[1]?.toLowerCase()).filter((value): value is string => Boolean(value));
  return [...new Set(variables.filter((value) => !WHATSAPP_TEMPLATE_VARIABLES.includes(value as WhatsappTemplateVariable)))];
}

export function renderWhatsappMessageTemplate(template: string, values: Record<WhatsappTemplateVariable, string>): string {
  return template.replace(/{{\s*(nombre|numero|carro|nombre_vendedor|correo_vendedor|empresa_vendedor|numero_vendedor)\s*}}/gi, (_, variable: WhatsappTemplateVariable) => values[variable.toLowerCase() as WhatsappTemplateVariable]);
}
