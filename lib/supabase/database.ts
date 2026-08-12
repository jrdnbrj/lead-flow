import type { ConversationState, FollowUpActionStatus, LeadStatus, LeadTemperature, MessageDirection, NextActionType, PaymentMethod, LeadTimeframe, WhatsappStatus } from "@/lib/domain/lead";

export type Database = {
  public: {
    Tables: {
      leads: {
        Row: {
          id: string;
          user_id: string | null;
          tenant_id: string | null;
          created_at: string;
          updated_at: string;
          full_name: string;
          phone: string;
          car_model: string;
          car_models: string[];
          timeframe: LeadTimeframe;
          payment_method: PaymentMethod;
          trade_in_car: boolean;
          score: number;
          temperature: LeadTemperature;
          notes: string | null;
          whatsapp_status: WhatsappStatus;
          whatsapp_attempts: number;
          whatsapp_last_error: string | null;
          whatsapp_sent_at: string | null;
          conversation_state: ConversationState;
          next_action_at: string | null;
          next_action_type: NextActionType | null;
          last_activity_at: string | null;
          last_customer_message_at: string | null;
          last_agent_message_at: string | null;
          last_customer_message_preview: string | null;
          deleted_at: string | null;
          status: LeadStatus;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          tenant_id?: string | null;
          created_at?: string;
          updated_at?: string;
          full_name: string;
          phone: string;
          car_model: string;
          car_models?: string[];
          timeframe: LeadTimeframe;
          payment_method: PaymentMethod;
          trade_in_car?: boolean;
          score?: number;
          temperature?: LeadTemperature;
          notes?: string | null;
          whatsapp_status?: WhatsappStatus;
          whatsapp_attempts?: number;
          whatsapp_last_error?: string | null;
          whatsapp_sent_at?: string | null;
          conversation_state?: ConversationState;
          next_action_at?: string | null;
          next_action_type?: NextActionType | null;
          last_activity_at?: string | null;
          last_customer_message_at?: string | null;
          last_agent_message_at?: string | null;
          last_customer_message_preview?: string | null;
          deleted_at?: string | null;
          status?: LeadStatus;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
      leadflow_settings: {
        Row: {
          id: string;
          user_id: string;
          whatsapp_message_template: string | null;
          seller_name: string | null;
          seller_phone: string | null;
          seller_email: string | null;
          seller_company: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          whatsapp_message_template?: string | null;
          seller_name?: string | null;
          seller_phone?: string | null;
          seller_email?: string | null;
          seller_company?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leadflow_settings"]["Insert"]>;
        Relationships: [];
      };
      leadflow_installation: {
        Row: {
          singleton: boolean;
          advisor_user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          singleton?: boolean;
          advisor_user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leadflow_installation"]["Insert"]>;
        Relationships: [];
      };
      car_models: {
        Row: {
          id: string;
          name: string;
          sort_order: number;
          active: boolean;
          is_other: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          sort_order: number;
          active?: boolean;
          is_other?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["car_models"]["Insert"]>;
        Relationships: [];
      };
      car_model_images: {
        Row: {
          id: string;
          car_model_id: string;
          image_url: string;
          storage_path: string | null;
          alt_text: string | null;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          car_model_id: string;
          image_url: string;
          storage_path?: string | null;
          alt_text?: string | null;
          sort_order?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["car_model_images"]["Insert"]>;
        Relationships: [];
      };
      lead_messages: {
        Row: {
          id: string;
          lead_id: string;
          provider_message_id: string | null;
          direction: MessageDirection;
          status: WhatsappStatus;
          body: string | null;
          phone: string | null;
          created_at: string;
          delivered_at: string | null;
          read_at: string | null;
          failed_at: string | null;
          raw_payload: Record<string, unknown> | null;
          inbound_classification: "NO_SUGGESTION" | "PENDING" | "REVIEW" | null;
        };
        Insert: {
          id?: string;
          lead_id: string;
          provider_message_id?: string | null;
          direction: MessageDirection;
          status?: WhatsappStatus;
          body?: string | null;
          phone?: string | null;
          created_at?: string;
          delivered_at?: string | null;
          read_at?: string | null;
          failed_at?: string | null;
          raw_payload?: Record<string, unknown> | null;
          inbound_classification?: "NO_SUGGESTION" | "PENDING" | "REVIEW" | null;
        };
        Update: Partial<Database["public"]["Tables"]["lead_messages"]["Insert"]>;
        Relationships: [];
      };
      lead_inbound_manual_decisions: {
        Row: { id: string; idempotency_key: string; lead_id: string; source_message_id: string | null; action_id: string | null; decision: "REQUIRES_RESPONSE" | "NO_RESPONSE_REQUIRED"; result: Record<string, unknown>; created_at: string };
        Insert: { id?: string; idempotency_key: string; lead_id: string; source_message_id?: string | null; action_id?: string | null; decision: "REQUIRES_RESPONSE" | "NO_RESPONSE_REQUIRED"; result: Record<string, unknown>; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["lead_inbound_manual_decisions"]["Insert"]>;
        Relationships: [];
      };
      lead_milestones: {
        Row: {
          id: string;
          lead_id: string;
          milestone_type: "PURCHASE_DECISION";
          recorded_at: string;
          origin: "MANUAL";
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          milestone_type: "PURCHASE_DECISION";
          recorded_at?: string;
          origin?: "MANUAL";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_milestones"]["Insert"]>;
        Relationships: [];
      };
      lead_follow_up_actions: {
        Row: {
          id: string;
          lead_id: string;
          action_type: NextActionType;
          scheduled_for: string;
          status: FollowUpActionStatus;
          action_version: number;
          origin: "MANUAL" | "SUGGESTED";
          source_message_id: string | null;
          note: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          action_type: NextActionType;
          scheduled_for: string;
          status?: FollowUpActionStatus;
          action_version?: number;
          origin?: "MANUAL" | "SUGGESTED";
          source_message_id?: string | null;
          note?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["lead_follow_up_actions"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      record_purchase_decision_v1: {
        Args: { p_lead_id: string; p_idempotency_key?: string | null; p_recorded_at?: string | null };
        Returns: Record<string, unknown>;
      };
      persist_inbound_message_v1: {
        Args: {
          p_lead_id: string;
          p_evolution_instance: string;
          p_provider_message_id: string;
          p_phone: string;
          p_body?: string | null;
          p_created_at?: string | null;
          p_classification: string;
          p_association_status: string;
          p_match_ambiguous?: boolean;
        };
        Returns: Record<string, unknown>;
      };
      upsert_inbound_response_action_v1: {
        Args: {
          p_lead_id: string;
          p_source_message_id: string;
          p_classification: string;
          p_scheduled_for: string;
          p_idempotency_key: string;
        };
        Returns: Record<string, unknown>;
      };
      correct_inbound_response_v1: {
        Args: {
          p_lead_id: string;
          p_decision: string;
          p_source_message_id?: string | null;
          p_action_id?: string | null;
          p_expected_action_version?: number | null;
          p_scheduled_for?: string | null;
          p_idempotency_key?: string | null;
        };
        Returns: Record<string, unknown>;
      };
      soft_delete_lead: {
        Args: { p_lead_id: string };
        Returns: boolean;
      };
      create_lead_follow_up_action_v1: {
        Args: {
          p_lead_id: string;
          p_action_type: NextActionType;
          p_scheduled_for: string;
          p_note?: string | null;
          p_idempotency_key?: string | null;
          p_action_id?: string | null;
          p_expected_action_version?: number | null;
        };
        Returns: Record<string, unknown>;
      };
      transition_lead_follow_up_action_v1: {
        Args: {
          p_action_id: string;
          p_status: FollowUpActionStatus;
          p_expected_action_version: number;
          p_scheduled_for?: string | null;
          p_note?: string | null;
          p_idempotency_key?: string | null;
          p_cancel_reason?: string | null;
        };
        Returns: Record<string, unknown>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
