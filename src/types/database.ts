export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      food_log_sync_state: {
        Row: {
          revision: number
          user_id: string
        }
        Insert: {
          revision?: number
          user_id: string
        }
        Update: {
          revision?: number
          user_id?: string
        }
        Relationships: []
      }
      food_logs: {
        Row: {
          calories: number
          carbs: number
          client_created_at: string
          deleted_at: string | null
          fat: number
          food_name: string
          id: string
          last_mutation_id: string
          legacy_local_id: string | null
          logged_date: string
          meal_type: string
          originating_device_id: string | null
          protein: number
          received_at: string
          server_revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          calories: number
          carbs: number
          client_created_at: string
          deleted_at?: string | null
          fat: number
          food_name: string
          id: string
          last_mutation_id: string
          legacy_local_id?: string | null
          logged_date: string
          meal_type: string
          originating_device_id?: string | null
          protein: number
          received_at: string
          server_revision: number
          updated_at: string
          user_id: string
        }
        Update: {
          calories?: number
          carbs?: number
          client_created_at?: string
          deleted_at?: string | null
          fat?: number
          food_name?: string
          id?: string
          last_mutation_id?: string
          legacy_local_id?: string | null
          logged_date?: string
          meal_type?: string
          originating_device_id?: string | null
          protein?: number
          received_at?: string
          server_revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      nutrition_targets: {
        Row: {
          calories: number
          carbs: number
          fat: number
          last_mutation_id: string
          protein: number
          revision: number
          updated_at: string
          user_id: string
        }
        Insert: {
          calories: number
          carbs: number
          fat: number
          last_mutation_id: string
          protein: number
          revision: number
          updated_at: string
          user_id: string
        }
        Update: {
          calories?: number
          carbs?: number
          fat?: number
          last_mutation_id?: string
          protein?: number
          revision?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_food_log_mutations: {
        Args: { p_mutations: Json }
        Returns: {
          calories: number
          carbs: number
          client_created_at: string
          deleted_at: string | null
          fat: number
          food_name: string
          id: string
          last_mutation_id: string
          legacy_local_id: string | null
          logged_date: string
          meal_type: string
          originating_device_id: string | null
          protein: number
          received_at: string
          server_revision: number
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "food_logs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      apply_nutrition_targets: {
        Args: {
          p_base_revision: number
          p_calories: number
          p_carbs: number
          p_fat: number
          p_mutation_id: string
          p_protein: number
        }
        Returns: {
          calories: number
          carbs: number
          fat: number
          last_mutation_id: string
          protein: number
          revision: number
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "nutrition_targets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      pull_food_log_changes: {
        Args: {
          p_after_revision?: number
          p_page_size?: number
          p_watermark?: number
        }
        Returns: Json
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

