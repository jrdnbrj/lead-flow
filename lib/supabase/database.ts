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
        };
        Update: Partial<Database["public"]["Tables"]["lead_messages"]["Insert"]>;
        Relationships: [];
      };
      lead_follow_up_actions: {
        Row: {
          id: string;
          lead_id: string;
          action_type: NextActionType;
          scheduled_for: string;
          status: FollowUpActionStatus;
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
      soft_delete_lead: {
        Args: { p_lead_id: string };
        Returns: boolean;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
