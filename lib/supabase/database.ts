import type { LeadStatus, LeadTemperature, PaymentMethod, LeadTimeframe, WhatsappStatus } from "@/lib/domain/lead";

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
          status?: LeadStatus;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
