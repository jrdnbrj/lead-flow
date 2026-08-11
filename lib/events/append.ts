import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppendResult, EventEnvelopeInput } from './types';

export async function appendLeadflowEvent(client: SupabaseClient, event: EventEnvelopeInput): Promise<AppendResult> {
  const { data, error } = await client.rpc('append_leadflow_event_v1', { p_event: event });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('invalid append result');
  return data as AppendResult;
}
