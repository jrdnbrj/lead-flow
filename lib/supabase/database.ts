export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      car_model_colors: {
        Row: {
          active: boolean
          car_model_id: string
          created_at: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          car_model_id: string
          created_at?: string
          id: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          car_model_id?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "car_model_colors_car_model_id_fkey"
            columns: ["car_model_id"]
            isOneToOne: false
            referencedRelation: "car_models"
            referencedColumns: ["id"]
          },
        ]
      }
      car_model_images: {
        Row: {
          alt_text: string | null
          car_model_id: string
          created_at: string
          id: string
          image_url: string
          sort_order: number
          storage_path: string | null
        }
        Insert: {
          alt_text?: string | null
          car_model_id: string
          created_at?: string
          id?: string
          image_url: string
          sort_order?: number
          storage_path?: string | null
        }
        Update: {
          alt_text?: string | null
          car_model_id?: string
          created_at?: string
          id?: string
          image_url?: string
          sort_order?: number
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "car_model_images_car_model_id_fkey"
            columns: ["car_model_id"]
            isOneToOne: false
            referencedRelation: "car_models"
            referencedColumns: ["id"]
          },
        ]
      }
      car_models: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_other: boolean
          lead_registration_count: number
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id: string
          is_other?: boolean
          lead_registration_count?: number
          name: string
          sort_order: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_other?: boolean
          lead_registration_count?: number
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      car_model_assets: {
        Row: {
          active: boolean
          asset_kind: string
          car_model_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          active?: boolean
          asset_kind: string
          car_model_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          active?: boolean
          asset_kind?: string
          car_model_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_model_assets_car_model_id_fkey"
            columns: ["car_model_id"]
            isOneToOne: false
            referencedRelation: "car_models"
            referencedColumns: ["id"]
          },
        ]
      }
      car_model_color_assets: {
        Row: {
          active: boolean
          asset_kind: string
          car_model_color_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          active?: boolean
          asset_kind: string
          car_model_color_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          active?: boolean
          asset_kind?: string
          car_model_color_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "car_model_color_assets_car_model_color_id_fkey"
            columns: ["car_model_color_id"]
            isOneToOne: false
            referencedRelation: "car_model_colors"
            referencedColumns: ["id"]
          },
        ]
      }
      external_effect_attempt_observations: {
        Row: {
          attempt_no: number
          correlation_id: string
          effect_id: string
          evidence_digest: string | null
          id: string
          observation_kind: string
          observed_at: string
          provider_status: string | null
          source: string
        }
        Insert: {
          attempt_no: number
          correlation_id?: string
          effect_id: string
          evidence_digest?: string | null
          id?: string
          observation_kind: string
          observed_at?: string
          provider_status?: string | null
          source: string
        }
        Update: {
          attempt_no?: number
          correlation_id?: string
          effect_id?: string
          evidence_digest?: string | null
          id?: string
          observation_kind?: string
          observed_at?: string
          provider_status?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_effect_attempt_observations_effect_id_attempt_no_fkey"
            columns: ["effect_id", "attempt_no"]
            isOneToOne: false
            referencedRelation: "external_effect_attempts"
            referencedColumns: ["effect_id", "attempt_no"]
          },
        ]
      }
      external_effect_attempts: {
        Row: {
          attempt_no: number
          claim_token_digest: string
          claimed_at: string | null
          claimed_by: string | null
          completed_at: string | null
          created_at: string
          effect_id: string
          lease_expires_at: string | null
          payload_digest: string | null
          provider_message_id: string | null
          provider_status: string | null
          request_started_at: string | null
          result_kind: string | null
        }
        Insert: {
          attempt_no: number
          claim_token_digest: string
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          effect_id: string
          lease_expires_at?: string | null
          payload_digest?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          request_started_at?: string | null
          result_kind?: string | null
        }
        Update: {
          attempt_no?: number
          claim_token_digest?: string
          claimed_at?: string | null
          claimed_by?: string | null
          completed_at?: string | null
          created_at?: string
          effect_id?: string
          lease_expires_at?: string | null
          payload_digest?: string | null
          provider_message_id?: string | null
          provider_status?: string | null
          request_started_at?: string | null
          result_kind?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "external_effect_attempts_effect_id_fkey"
            columns: ["effect_id"]
            isOneToOne: false
            referencedRelation: "external_effects"
            referencedColumns: ["id"]
          },
        ]
      }
      external_effects: {
        Row: {
          business_key: string
          created_at: string
          current_attempt_no: number
          effect_kind: string
          effect_version: number
          id: string
          item_id: string | null
          lead_id: string
          next_attempt_at: string | null
          provider: string
          review_required: boolean
          state: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_key: string
          created_at?: string
          current_attempt_no?: number
          effect_kind: string
          effect_version?: number
          id?: string
          item_id?: string | null
          lead_id: string
          next_attempt_at?: string | null
          provider?: string
          review_required?: boolean
          state?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_key?: string
          created_at?: string
          current_attempt_no?: number
          effect_kind?: string
          effect_version?: number
          id?: string
          item_id?: string | null
          lead_id?: string
          next_attempt_at?: string | null
          provider?: string
          review_required?: boolean
          state?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "external_effects_item_fk"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "lead_contact_operation_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_effects_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contact_operation_commands: {
        Row: {
          created_at: string
          effect_id: string
          id: string
          idempotency_key: string
          result: Json
        }
        Insert: {
          created_at?: string
          effect_id: string
          id?: string
          idempotency_key: string
          result: Json
        }
        Update: {
          created_at?: string
          effect_id?: string
          id?: string
          idempotency_key?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lead_contact_operation_commands_effect_id_fkey"
            columns: ["effect_id"]
            isOneToOne: false
            referencedRelation: "external_effects"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contact_operation_items: {
        Row: {
          availability: string
          created_at: string
          effect_id: string | null
          failure_code: string | null
          id: string
          item_key: string
          lead_message_id: string | null
          operation_id: string
          provider_message_id: string | null
          resource_kind: string
          resource_version: string
          result: string | null
          updated_at: string
        }
        Insert: {
          availability: string
          created_at?: string
          effect_id?: string | null
          failure_code?: string | null
          id?: string
          item_key: string
          lead_message_id?: string | null
          operation_id: string
          provider_message_id?: string | null
          resource_kind: string
          resource_version: string
          result?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string
          created_at?: string
          effect_id?: string | null
          failure_code?: string | null
          id?: string
          item_key?: string
          lead_message_id?: string | null
          operation_id?: string
          provider_message_id?: string | null
          resource_kind?: string
          resource_version?: string
          result?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contact_operation_items_effect_id_fkey"
            columns: ["effect_id"]
            isOneToOne: false
            referencedRelation: "external_effects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_contact_operation_items_lead_message_id_fkey"
            columns: ["lead_message_id"]
            isOneToOne: false
            referencedRelation: "lead_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_contact_operation_items_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "lead_contact_operations"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_contact_operations: {
        Row: {
          configuration_digest: string
          created_at: string
          id: string
          lead_id: string
          operation_type: string
          operation_version: number
          status: string
          updated_at: string
        }
        Insert: {
          configuration_digest: string
          created_at?: string
          id?: string
          lead_id: string
          operation_type: string
          operation_version?: number
          status?: string
          updated_at?: string
        }
        Update: {
          configuration_digest?: string
          created_at?: string
          id?: string
          lead_id?: string
          operation_type?: string
          operation_version?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_contact_operations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_follow_up_action_commands: {
        Row: {
          action_id: string | null
          command: string
          created_at: string
          idempotency_key: string
          lead_id: string
          result: Json
        }
        Insert: {
          action_id?: string | null
          command: string
          created_at?: string
          idempotency_key: string
          lead_id: string
          result: Json
        }
        Update: {
          action_id?: string | null
          command?: string
          created_at?: string
          idempotency_key?: string
          lead_id?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "lead_follow_up_action_commands_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "lead_follow_up_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_follow_up_action_commands_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_follow_up_actions: {
        Row: {
          action_type: Database["public"]["Enums"]["next_action_type"]
          action_version: number
          completed_at: string | null
          created_at: string
          id: string
          lead_id: string
          note: string | null
          origin: string
          scheduled_for: string
          source_message_id: string | null
          status: Database["public"]["Enums"]["follow_up_action_status"]
          updated_at: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["next_action_type"]
          action_version?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          lead_id: string
          note?: string | null
          origin?: string
          scheduled_for: string
          source_message_id?: string | null
          status?: Database["public"]["Enums"]["follow_up_action_status"]
          updated_at?: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["next_action_type"]
          action_version?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          note?: string | null
          origin?: string
          scheduled_for?: string
          source_message_id?: string | null
          status?: Database["public"]["Enums"]["follow_up_action_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_follow_up_actions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_follow_up_actions_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "lead_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_inbound_manual_decisions: {
        Row: {
          action_id: string | null
          created_at: string
          decision: string
          id: string
          idempotency_key: string
          lead_id: string
          result: Json
          source_message_id: string | null
        }
        Insert: {
          action_id?: string | null
          created_at?: string
          decision: string
          id?: string
          idempotency_key: string
          lead_id: string
          result: Json
          source_message_id?: string | null
        }
        Update: {
          action_id?: string | null
          created_at?: string
          decision?: string
          id?: string
          idempotency_key?: string
          lead_id?: string
          result?: Json
          source_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_inbound_manual_decisions_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "lead_follow_up_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_inbound_manual_decisions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_inbound_manual_decisions_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "lead_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_messages: {
        Row: {
          body: string | null
          created_at: string
          delivered_at: string | null
          direction: string
          evolution_instance: string | null
          external_effect_id: string | null
          failed_at: string | null
          id: string
          inbound_classification: string | null
          lead_id: string
          phone: string | null
          provider_message_id: string | null
          raw_payload: Json | null
          read_at: string | null
          status: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          direction: string
          evolution_instance?: string | null
          external_effect_id?: string | null
          failed_at?: string | null
          id?: string
          inbound_classification?: string | null
          lead_id: string
          phone?: string | null
          provider_message_id?: string | null
          raw_payload?: Json | null
          read_at?: string | null
          status?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          delivered_at?: string | null
          direction?: string
          evolution_instance?: string | null
          external_effect_id?: string | null
          failed_at?: string | null
          id?: string
          inbound_classification?: string | null
          lead_id?: string
          phone?: string | null
          provider_message_id?: string | null
          raw_payload?: Json | null
          read_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_messages_external_effect_id_fkey"
            columns: ["external_effect_id"]
            isOneToOne: false
            referencedRelation: "external_effects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_milestones: {
        Row: {
          buyer_national_id: string | null
          created_at: string
          id: string
          lead_id: string
          milestone_type: string
          origin: string
          recorded_at: string
        }
        Insert: {
          buyer_national_id?: string | null
          created_at?: string
          id?: string
          lead_id: string
          milestone_type: string
          origin?: string
          recorded_at?: string
        }
        Update: {
          buyer_national_id?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          milestone_type?: string
          origin?: string
          recorded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_milestones_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leadflow_event_registry: {
        Row: {
          aggregate_table: string | null
          aggregate_type: string | null
          allowed_stage: string
          created_at: string
          emit_status: string
          event_class: string
          event_type: string
          identity_recipe: Json
          owner_capability: string
          payload_contract: Json
          schema_version: number
          updated_at: string
        }
        Insert: {
          aggregate_table?: string | null
          aggregate_type?: string | null
          allowed_stage: string
          created_at?: string
          emit_status?: string
          event_class: string
          event_type: string
          identity_recipe: Json
          owner_capability: string
          payload_contract: Json
          schema_version?: number
          updated_at?: string
        }
        Update: {
          aggregate_table?: string | null
          aggregate_type?: string | null
          allowed_stage?: string
          created_at?: string
          emit_status?: string
          event_class?: string
          event_type?: string
          identity_recipe?: Json
          owner_capability?: string
          payload_contract?: Json
          schema_version?: number
          updated_at?: string
        }
        Relationships: []
      }
      leadflow_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          aggregate_id: string | null
          aggregate_type: string | null
          aggregate_version: number | null
          correlation_id: string | null
          error_code: string | null
          event_key: string
          event_type: string
          id: string
          idempotency_key: string | null
          occurred_at: string
          payload: Json
          result: string | null
          schema_version: number
          source: string
          stage: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          aggregate_id?: string | null
          aggregate_type?: string | null
          aggregate_version?: number | null
          correlation_id?: string | null
          error_code?: string | null
          event_key: string
          event_type: string
          id?: string
          idempotency_key?: string | null
          occurred_at: string
          payload: Json
          result?: string | null
          schema_version?: number
          source: string
          stage: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          aggregate_id?: string | null
          aggregate_type?: string | null
          aggregate_version?: number | null
          correlation_id?: string | null
          error_code?: string | null
          event_key?: string
          event_type?: string
          id?: string
          idempotency_key?: string | null
          occurred_at?: string
          payload?: Json
          result?: string | null
          schema_version?: number
          source?: string
          stage?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leadflow_events_event_type_schema_version_fkey"
            columns: ["event_type", "schema_version"]
            isOneToOne: false
            referencedRelation: "leadflow_event_registry"
            referencedColumns: ["event_type", "schema_version"]
          },
        ]
      }
      leadflow_installation: {
        Row: {
          advisor_user_id: string
          created_at: string
          singleton: boolean
          updated_at: string
        }
        Insert: {
          advisor_user_id: string
          created_at?: string
          singleton?: boolean
          updated_at?: string
        }
        Update: {
          advisor_user_id?: string
          created_at?: string
          singleton?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      leadflow_settings: {
        Row: {
          created_at: string
          id: string
          seller_company: string | null
          seller_email: string | null
          seller_name: string | null
          seller_phone: string | null
          updated_at: string
          user_id: string
          whatsapp_message_template: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          seller_company?: string | null
          seller_email?: string | null
          seller_name?: string | null
          seller_phone?: string | null
          updated_at?: string
          user_id: string
          whatsapp_message_template?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          seller_company?: string | null
          seller_email?: string | null
          seller_name?: string | null
          seller_phone?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_message_template?: string | null
        }
        Relationships: []
      }
      leads: {
        Row: {
          car_model: string
          car_models: string[]
          conversation_state: Database["public"]["Enums"]["conversation_state"]
          created_at: string
          deleted_at: string | null
          full_name: string
          id: string
          national_id: string | null
          email: string | null
          last_activity_at: string | null
          last_agent_message_at: string | null
          last_customer_message_at: string | null
          last_customer_message_preview: string | null
          next_action_at: string | null
          next_action_type:
            | Database["public"]["Enums"]["next_action_type"]
            | null
          notes: string | null
          payment_method: string
          phone: string
          score: number
          status: Database["public"]["Enums"]["lead_status"]
          temperature: Database["public"]["Enums"]["lead_temperature"]
          tenant_id: string | null
          timeframe: string
          trade_in_car: boolean
          updated_at: string
          user_id: string | null
          whatsapp_attempts: number
          whatsapp_last_error: string | null
          whatsapp_sent_at: string | null
          whatsapp_status: Database["public"]["Enums"]["whatsapp_status"]
        }
        Insert: {
          car_model: string
          car_models?: string[]
          conversation_state?: Database["public"]["Enums"]["conversation_state"]
          created_at?: string
          deleted_at?: string | null
          full_name: string
          id?: string
          national_id?: string | null
          email?: string | null
          last_activity_at?: string | null
          last_agent_message_at?: string | null
          last_customer_message_at?: string | null
          last_customer_message_preview?: string | null
          next_action_at?: string | null
          next_action_type?:
            | Database["public"]["Enums"]["next_action_type"]
            | null
          notes?: string | null
          payment_method: string
          phone: string
          score?: number
          status?: Database["public"]["Enums"]["lead_status"]
          temperature?: Database["public"]["Enums"]["lead_temperature"]
          tenant_id?: string | null
          timeframe: string
          trade_in_car?: boolean
          updated_at?: string
          user_id?: string | null
          whatsapp_attempts?: number
          whatsapp_last_error?: string | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: Database["public"]["Enums"]["whatsapp_status"]
        }
        Update: {
          car_model?: string
          car_models?: string[]
          conversation_state?: Database["public"]["Enums"]["conversation_state"]
          created_at?: string
          deleted_at?: string | null
          full_name?: string
          id?: string
          national_id?: string | null
          email?: string | null
          last_activity_at?: string | null
          last_agent_message_at?: string | null
          last_customer_message_at?: string | null
          last_customer_message_preview?: string | null
          next_action_at?: string | null
          next_action_type?:
            | Database["public"]["Enums"]["next_action_type"]
            | null
          notes?: string | null
          payment_method?: string
          phone?: string
          score?: number
          status?: Database["public"]["Enums"]["lead_status"]
          temperature?: Database["public"]["Enums"]["lead_temperature"]
          tenant_id?: string | null
          timeframe?: string
          trade_in_car?: boolean
          updated_at?: string
          user_id?: string | null
          whatsapp_attempts?: number
          whatsapp_last_error?: string | null
          whatsapp_sent_at?: string | null
          whatsapp_status?: Database["public"]["Enums"]["whatsapp_status"]
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      append_leadflow_event_v1: { Args: { p_event: Json }; Returns: Json }
      begin_first_contact_effect_io_v1: {
        Args: {
          p_attempt_no: number
          p_claim_token_digest: string
          p_effect_id: string
          p_payload_digest?: string
        }
        Returns: Json
      }
      claim_first_contact_effect_v1: {
        Args: { p_claim_token_digest: string; p_effect_id: string }
        Returns: Json
      }
      correct_inbound_response_v1: {
        Args: {
          p_action_id?: string
          p_decision: string
          p_expected_action_version?: number
          p_idempotency_key?: string
          p_lead_id: string
          p_scheduled_for?: string
          p_source_message_id?: string
        }
        Returns: Json
      }
      create_lead_follow_up_action_v1: {
        Args: {
          p_action_id?: string
          p_action_type: Database["public"]["Enums"]["next_action_type"]
          p_expected_action_version?: number
          p_idempotency_key?: string
          p_lead_id: string
          p_note?: string
          p_scheduled_for: string
        }
        Returns: Json
      }
      get_first_contact_v1: { Args: { p_lead_id: string }; Returns: Json }
      leadflow_action_command_replay_v1: {
        Args: { p_key: string }
        Returns: Json
      }
      leadflow_action_json_v1: {
        Args: {
          p_action: Database["public"]["Tables"]["lead_follow_up_actions"]["Row"]
        }
        Returns: Json
      }
      leadflow_action_owner_v1: { Args: never; Returns: string }
      leadflow_event_key_v1: {
        Args: {
          p_event_type: string
          p_identity_components: Json
          p_schema_version: number
        }
        Returns: string
      }
      leadflow_first_contact_owner_v1: {
        Args: { p_lead_id: string }
        Returns: string
      }
      leadflow_identity_recipe_v1: {
        Args: { p_event_type: string; p_names: string[] }
        Returns: Json
      }
      leadflow_payload_contract_v1: {
        Args: {
          p_event_type: string
          p_optional: string[]
          p_required: string[]
        }
        Returns: Json
      }
      leadflow_require_event_append_v1: {
        Args: { p_event: Json }
        Returns: Json
      }
      leadflow_validate_event_contract_v1: {
        Args: {
          p_event: Json
          p_registry: Database["public"]["Tables"]["leadflow_event_registry"]["Row"]
        }
        Returns: undefined
      }
      leadflow_validate_payload_contract_v1: {
        Args: { p_contract: Json; p_payload: Json }
        Returns: undefined
      }
      leadflow_validate_payload_value_v1: {
        Args: { p_path: string; p_spec: Json; p_value: Json }
        Returns: undefined
      }
      persist_inbound_message_v1: {
        Args: {
          p_association_status: string
          p_body: string
          p_classification: string
          p_created_at: string
          p_evolution_instance: string
          p_lead_id: string
          p_match_ambiguous?: boolean
          p_phone: string
          p_provider_message_id: string
        }
        Returns: Json
      }
      record_first_contact_effect_result_v1: {
        Args: {
          p_attempt_no: number
          p_claim_token_digest: string
          p_effect_id: string
          p_message_body?: string
          p_provider_message_id?: string
          p_provider_status?: string
          p_result_kind: string
        }
        Returns: Json
      }
      record_purchase_decision_v1: {
        Args: {
          p_idempotency_key?: string
          p_lead_id: string
          p_recorded_at?: string
        }
        Returns: Json
      }
      record_purchase_decision_v2: {
        Args: {
          p_idempotency_key?: string
          p_lead_id: string
          p_national_id: string
          p_recorded_at?: string
        }
        Returns: Json
      }
      request_first_contact_v1: {
        Args: {
          p_configuration_digest: string
          p_idempotency_key: string
          p_items: Json
          p_lead_id: string
        }
        Returns: Json
      }
      retry_first_contact_effect_v1: {
        Args: {
          p_effect_id: string
          p_expected_effect_version: number
          p_idempotency_key: string
        }
        Returns: Json
      }
      soft_delete_lead: { Args: { p_lead_id: string }; Returns: boolean }
      transition_lead_follow_up_action_v1: {
        Args: {
          p_action_id: string
          p_cancel_reason?: string
          p_expected_action_version: number
          p_idempotency_key?: string
          p_note?: string
          p_scheduled_for?: string
          p_status: Database["public"]["Enums"]["follow_up_action_status"]
        }
        Returns: Json
      }
      upsert_inbound_response_action_v1: {
        Args: {
          p_classification: string
          p_idempotency_key: string
          p_lead_id: string
          p_scheduled_for: string
          p_source_message_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      conversation_state: "NEW" | "ACTIVE" | "WAITING_CUSTOMER" | "CLOSED"
      follow_up_action_status:
        | "PENDING"
        | "DONE"
        | "POSTPONED"
        | "IGNORED"
        | "CANCELED"
      lead_status: "NUEVO" | "CONTACTADO" | "COTIZADO" | "PERDIDO" | "CERRADO"
      lead_temperature: "HIGH" | "MEDIUM" | "LOW"
      next_action_type: "CALL" | "WHATSAPP" | "QUOTE" | "OTHER" | "RESPONSE"
      whatsapp_status:
        | "PENDING"
        | "SENT"
        | "FAILED"
        | "SERVER_ACK"
        | "DELIVERY_ACK"
        | "READ"
        | "PLAYED"
        | "RECEIVED"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      conversation_state: ["NEW", "ACTIVE", "WAITING_CUSTOMER", "CLOSED"],
      follow_up_action_status: [
        "PENDING",
        "DONE",
        "POSTPONED",
        "IGNORED",
        "CANCELED",
      ],
      lead_status: ["NUEVO", "CONTACTADO", "COTIZADO", "PERDIDO", "CERRADO"],
      lead_temperature: ["HIGH", "MEDIUM", "LOW"],
      next_action_type: ["CALL", "WHATSAPP", "QUOTE", "OTHER", "RESPONSE"],
      whatsapp_status: [
        "PENDING",
        "SENT",
        "FAILED",
        "SERVER_ACK",
        "DELIVERY_ACK",
        "READ",
        "PLAYED",
        "RECEIVED",
      ],
    },
  },
} as const
