import { createHash } from 'node:crypto';
import type { EventRegistryEntry, IdentityRecipeComponent } from './types';

export function trimAsciiSpaces(value: string): string {
  return value.replace(/^ +| +$/g, '');
}

export function canonicalComponentValue(value: string | number | null, recipe?: IdentityRecipeComponent, fingerprintKind?: string): string {
  if (value === null) return 'NULL';
  let text = String(value);
  if (recipe?.type === 'uuid') text = text.toLowerCase();
  if (recipe?.type === 'positive_int') text = text.replace(/^0+/, '') || '0';
  if (recipe?.type === 'digest_hex' || (recipe?.type === 'fingerprint_value' && fingerprintKind === 'RAW_BODY_SHA256')) text = text.toLowerCase();
  if (recipe?.normalization === 'TRIM_ASCII_THEN_NFC' || (recipe?.type === 'fingerprint_value' && fingerprintKind === 'PROVIDER_MESSAGE_ID')) text = trimAsciiSpaces(text).normalize('NFC');
  else text = text.normalize('NFC');
  return text;
}

export function buildEventKey(registry: EventRegistryEntry, components: Array<{ name: string; value: string | number | null }>): string {
  if (components.length !== registry.identity_recipe.length) throw new Error('identity component count mismatch');
  const framed = components.map((component, index) => {
    const recipe = registry.identity_recipe[index];
    if (component.name !== recipe.component) throw new Error('identity recipe mismatch');
    if (component.value === null && !recipe.nullable) throw new Error('identity null is not allowed');
    const previousFingerprintKind = components[index - 1]?.name === 'fingerprint_kind' ? String(components[index - 1].value) : undefined;
    const value = canonicalComponentValue(component.value, recipe, previousFingerprintKind);
    if (recipe.constant !== null && value !== recipe.constant) throw new Error('identity constant mismatch');
    if (recipe.type === 'uuid' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) throw new Error('identity uuid is not canonical');
    if (recipe.type === 'positive_int' && !/^[1-9][0-9]*$/.test(value)) throw new Error('identity positive integer is invalid');
    if (recipe.type === 'digest_hex' && !/^[0-9a-f]{64}$/.test(value)) throw new Error('identity digest is invalid');
    if (recipe.type === 'fingerprint_kind' && !['PROVIDER_MESSAGE_ID', 'RAW_BODY_SHA256'].includes(value)) throw new Error('identity fingerprint kind is invalid');
    if (recipe.type === 'fingerprint_kind' && value.length === 0) throw new Error('identity fingerprint kind is empty');
    if (recipe.type === 'fingerprint_value' && previousFingerprintKind === 'RAW_BODY_SHA256' && !/^[0-9a-f]{64}$/.test(value)) throw new Error('identity fingerprint digest is invalid');
    if (recipe.type === 'fingerprint_value' && value.length === 0) throw new Error('identity fingerprint value is empty');
    if (value !== 'NULL' && /[\u0000-\u001f\u007f]/.test(value)) throw new Error('identity text contains controls');
    return `${component.name}=${Buffer.byteLength(value, 'utf8')}:${value};`;
  }).join('');
  const material = `leadflow-event-key/v1|event_type=${registry.event_type}|schema_version=${registry.schema_version}|${framed}`;
  return createHash('sha256').update(Buffer.from(material, 'utf8')).digest('hex');
}
