export type EventClass = 'FACT' | 'ATTEMPT' | 'TRANSITION';
export type EventSource = 'PWA' | 'WEBHOOK' | 'PUSH' | 'SCHEDULER' | 'SYSTEM' | 'LEADFLOW_WHATSAPP_ACCEPTED' | 'NATIVE_WHATSAPP_CONFIRMED';
export type ActorKind = 'ADVISOR' | 'WEBHOOK' | 'SCHEDULER' | 'SYSTEM';

export type PayloadContract = {
  required: string[];
  optional: string[];
  types: Record<string, 'array' | 'boolean' | 'digest_hex' | 'positive_int' | 'safe_code' | 'safe_code_or_safe_text' | 'safe_text' | 'timestamp' | 'uuid' | string>;
  enums: Record<string, string[]>;
  normalization: Record<string, string>;
  rules?: Record<string, unknown>;
};

export type IdentityRecipeComponent = {
  component: string;
  type: 'digest_hex' | 'positive_int' | 'safe_text' | 'uuid' | string;
  nullable: boolean;
  constant: string | null;
  normalization: string;
  values?: string[];
  canonicalization?: string | null;
  order: number;
};

export type EventRegistryEntry = {
  event_type: string;
  schema_version: 1;
  event_class: EventClass;
  emit_status: 'REGISTERED_DISABLED' | 'ENABLED';
  owner_capability: string;
  allowed_stage: string;
  aggregate_type: string | null;
  aggregate_table: string | null;
  payload_contract: PayloadContract;
  identity_recipe: IdentityRecipeComponent[];
};

export type EventEnvelopeInput = {
  event_type: string;
  schema_version?: 1;
  occurred_at: string;
  source: EventSource;
  stage: string;
  actor_kind: ActorKind;
  actor_id?: string | null;
  correlation_id?: string | null;
  idempotency_key?: string | null;
  result?: string | null;
  error_code?: string | null;
  aggregate_type?: string | null;
  aggregate_id?: string | null;
  aggregate_version?: number | null;
  payload: Record<string, unknown>;
  identity_components: Array<{ name: string; value: string | number | null }>;
};

export type AppendResult = {
  status: 'APPENDED' | 'REPLAYED' | 'EVENT_KEY_CONFLICT' | string;
  id?: string;
  event_key?: string;
};
