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
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          id: string
          ip_address: string | null
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_slots: {
        Row: {
          court_id: string
          created_at: string
          created_by: string
          end_hour: number
          id: string
          reason: string | null
          slot_date: string
          start_hour: number
        }
        Insert: {
          court_id: string
          created_at?: string
          created_by: string
          end_hour: number
          id?: string
          reason?: string | null
          slot_date: string
          start_hour: number
        }
        Update: {
          court_id?: string
          created_at?: string
          created_by?: string
          end_hour?: number
          id?: string
          reason?: string | null
          slot_date?: string
          start_hour?: number
        }
        Relationships: [
          {
            foreignKeyName: "blocked_slots_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_slots_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_guests: {
        Row: {
          booking_id: string
          guest_number: number
          id: string
          qr_code: string
          redeemed_at: string | null
          redeemed_by: string | null
        }
        Insert: {
          booking_id: string
          guest_number?: number
          id?: string
          qr_code: string
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Update: {
          booking_id?: string
          guest_number?: number
          id?: string
          qr_code?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "booking_guests_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "booking_guests_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          admin_notes: string | null
          booking_date: string
          court_id: string
          created_at: string
          end_hour: number
          expires_at: string | null
          guest_count: number
          id: string
          payment_receipt_url: string | null
          start_hour: number
          status: string
          total_amount: number
          updated_at: string
          user_id: string | null
          walk_in_name: string | null
          walk_in_phone: string | null
        }
        Insert: {
          admin_notes?: string | null
          booking_date: string
          court_id: string
          created_at?: string
          end_hour: number
          expires_at?: string | null
          guest_count?: number
          id?: string
          payment_receipt_url?: string | null
          start_hour: number
          status?: string
          total_amount: number
          updated_at?: string
          user_id?: string | null
          walk_in_name?: string | null
          walk_in_phone?: string | null
        }
        Update: {
          admin_notes?: string | null
          booking_date?: string
          court_id?: string
          created_at?: string
          end_hour?: number
          expires_at?: string | null
          guest_count?: number
          id?: string
          payment_receipt_url?: string | null
          start_hour?: number
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string | null
          walk_in_name?: string | null
          walk_in_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_court_id_fkey"
            columns: ["court_id"]
            isOneToOne: false
            referencedRelation: "courts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_inquiries: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          phone: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          phone?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          phone?: string | null
          status?: string
        }
        Relationships: []
      }
      courts: {
        Row: {
          created_at: string
          hourly_rate: number
          id: string
          is_active: boolean
          name: string
          position_x: number | null
          position_y: number | null
        }
        Insert: {
          created_at?: string
          hourly_rate: number
          id?: string
          is_active?: boolean
          name: string
          position_x?: number | null
          position_y?: number | null
        }
        Update: {
          created_at?: string
          hourly_rate?: number
          id?: string
          is_active?: boolean
          name?: string
          position_x?: number | null
          position_y?: number | null
        }
        Relationships: []
      }
      facility_settings: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          entrance_pass_price_per_guest: number
          facility_name: string
          id: number
          max_booking_duration_hours: number
          operating_hours_end: number
          operating_hours_start: number
          pending_expiry_hours: number
          updated_at: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          entrance_pass_price_per_guest?: number
          facility_name?: string
          id?: number
          max_booking_duration_hours?: number
          operating_hours_end?: number
          operating_hours_start?: number
          pending_expiry_hours?: number
          updated_at?: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          entrance_pass_price_per_guest?: number
          facility_name?: string
          id?: number
          max_booking_duration_hours?: number
          operating_hours_end?: number
          operating_hours_start?: number
          pending_expiry_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          account_details: string
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          label: string
          qr_image_url: string | null
        }
        Insert: {
          account_details: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label: string
          qr_image_url?: string | null
        }
        Update: {
          account_details?: string
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string
          qr_image_url?: string | null
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name?: string | null
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          role?: string
        }
        Relationships: []
      }
      walk_in_entries: {
        Row: {
          created_at: string
          created_by: string
          entry_date: string
          guest_count: number
          id: string
          linked_booking_id: string | null
          notes: string | null
          total_amount: number
          walk_in_name: string | null
          walk_in_phone: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          entry_date: string
          guest_count: number
          id?: string
          linked_booking_id?: string | null
          notes?: string | null
          total_amount: number
          walk_in_name?: string | null
          walk_in_phone?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          entry_date?: string
          guest_count?: number
          id?: string
          linked_booking_id?: string | null
          notes?: string | null
          total_amount?: number
          walk_in_name?: string | null
          walk_in_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "walk_in_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "walk_in_entries_linked_booking_id_fkey"
            columns: ["linked_booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: { p_key: string; p_limit: number; p_window_seconds: number }
        Returns: Json
      }
      is_admin: { Args: never; Returns: boolean }
      log_audit_event: {
        Args: {
          p_action: string
          p_actor_user_id?: string
          p_ip_address?: string
          p_metadata?: Json
        }
        Returns: undefined
      }
      sweep_rate_limits: {
        Args: { older_than_seconds: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
