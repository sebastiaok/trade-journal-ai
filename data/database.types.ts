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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
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
  public: {
    Tables: {
      account_deposits: {
        Row: {
          account_id: string
          amount: number
          created_at: string
          id: string
          kind: string
          memo: string | null
          occurred_at: string
          owner: string
        }
        Insert: {
          account_id: string
          amount: number
          created_at?: string
          id?: string
          kind: string
          memo?: string | null
          occurred_at?: string
          owner: string
        }
        Update: {
          account_id?: string
          amount?: number
          created_at?: string
          id?: string
          kind?: string
          memo?: string | null
          occurred_at?: string
          owner?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_deposits_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          broker: string | null
          cash_balance: number
          created_at: string
          id: string
          name: string
          note: string | null
          opened_at: string | null
          owner: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
        }
        Insert: {
          broker?: string | null
          cash_balance?: number
          created_at?: string
          id?: string
          name: string
          note?: string | null
          opened_at?: string | null
          owner: string
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Update: {
          broker?: string | null
          cash_balance?: number
          created_at?: string
          id?: string
          name?: string
          note?: string | null
          opened_at?: string | null
          owner?: string
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
        }
        Relationships: []
      }
      holdings: {
        Row: {
          account_id: string
          avg_cost: number
          code: string | null
          id: string
          owner: string
          quantity: number
          symbol: string
          updated_at: string
        }
        Insert: {
          account_id: string
          avg_cost?: number
          code?: string | null
          id?: string
          owner: string
          quantity?: number
          symbol: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          avg_cost?: number
          code?: string | null
          id?: string
          owner?: string
          quantity?: number
          symbol?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      invest_checks: {
        Row: {
          account_id: string
          code: string | null
          created_at: string
          decision: string | null
          id: string
          items: Json
          owner: string
          resulted_trade_id: string | null
          scenario: string | null
          stop_loss: number | null
          symbol: string
          target_price: number | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          account_id: string
          code?: string | null
          created_at?: string
          decision?: string | null
          id?: string
          items?: Json
          owner: string
          resulted_trade_id?: string | null
          scenario?: string | null
          stop_loss?: number | null
          symbol: string
          target_price?: number | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          account_id?: string
          code?: string | null
          created_at?: string
          decision?: string | null
          id?: string
          items?: Json
          owner?: string
          resulted_trade_id?: string | null
          scenario?: string | null
          stop_loss?: number | null
          symbol?: string
          target_price?: number | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invest_checks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      realized_pnl: {
        Row: {
          account_id: string
          buy_price: number
          buy_trade_id: string | null
          created_at: string
          fee_amount: number
          id: string
          matched_qty: number
          owner: string
          pnl_amount: number
          realized_at: string
          sell_price: number
          sell_trade_id: string
          symbol: string
          tax_amount: number
        }
        Insert: {
          account_id: string
          buy_price: number
          buy_trade_id?: string | null
          created_at?: string
          fee_amount?: number
          id?: string
          matched_qty: number
          owner: string
          pnl_amount: number
          realized_at: string
          sell_price: number
          sell_trade_id: string
          symbol: string
          tax_amount?: number
        }
        Update: {
          account_id?: string
          buy_price?: number
          buy_trade_id?: string | null
          created_at?: string
          fee_amount?: number
          id?: string
          matched_qty?: number
          owner?: string
          pnl_amount?: number
          realized_at?: string
          sell_price?: number
          sell_trade_id?: string
          symbol?: string
          tax_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "realized_pnl_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "realized_pnl_buy_trade_id_fkey"
            columns: ["buy_trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "realized_pnl_sell_trade_id_fkey"
            columns: ["sell_trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_config: {
        Row: {
          annual_salary: number | null
          deduct_rate_high: number
          deduct_rate_low: number
          early_withdrawal_tax_rate: number
          isa_annual_contrib_cap: number
          isa_mandatory_years: number
          isa_tax_free_limit: number
          isa_total_contrib_cap: number
          owner: string
          pension_annual_contrib_cap: number
          pension_deduction_cap: number
          pension_savings_sub_cap: number
          salary_threshold: number
          tax_year: number
          updated_at: string
        }
        Insert: {
          annual_salary?: number | null
          deduct_rate_high?: number
          deduct_rate_low?: number
          early_withdrawal_tax_rate?: number
          isa_annual_contrib_cap?: number
          isa_mandatory_years?: number
          isa_tax_free_limit?: number
          isa_total_contrib_cap?: number
          owner: string
          pension_annual_contrib_cap?: number
          pension_deduction_cap?: number
          pension_savings_sub_cap?: number
          salary_threshold?: number
          tax_year?: number
          updated_at?: string
        }
        Update: {
          annual_salary?: number | null
          deduct_rate_high?: number
          deduct_rate_low?: number
          early_withdrawal_tax_rate?: number
          isa_annual_contrib_cap?: number
          isa_mandatory_years?: number
          isa_tax_free_limit?: number
          isa_total_contrib_cap?: number
          owner?: string
          pension_annual_contrib_cap?: number
          pension_deduction_cap?: number
          pension_savings_sub_cap?: number
          salary_threshold?: number
          tax_year?: number
          updated_at?: string
        }
        Relationships: []
      }
      tax_limits: {
        Row: {
          account_type: string
          annual_limit: number | null
          cumulative_limit: number | null
          deduction_limit: number | null
          id: string
          note: string | null
          year: number
        }
        Insert: {
          account_type: string
          annual_limit?: number | null
          cumulative_limit?: number | null
          deduction_limit?: number | null
          id?: string
          note?: string | null
          year: number
        }
        Update: {
          account_type?: string
          annual_limit?: number | null
          cumulative_limit?: number | null
          deduction_limit?: number | null
          id?: string
          note?: string | null
          year?: number
        }
        Relationships: []
      }
      tickers: {
        Row: {
          code: string
          created_at: string
          currency: string
          market: string | null
          name: string
          sector: string | null
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          market?: string | null
          name: string
          sector?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          market?: string | null
          name?: string
          sector?: string | null
        }
        Relationships: []
      }
      trades: {
        Row: {
          account_id: string
          amount: number
          broker: string | null
          code: string | null
          confidence: number | null
          created_at: string
          executed_at: string
          fee: number
          id: string
          linked_check_id: string | null
          note: Json | null
          owner: string
          price: number
          quantity: number
          realized_pnl: number | null
          return_rate: number | null
          side: Database["public"]["Enums"]["trade_side"]
          source: Database["public"]["Enums"]["trade_source"]
          symbol: string
          tax: number
          tax_deductible: boolean
          updated_at: string
        }
        Insert: {
          account_id: string
          amount?: number
          broker?: string | null
          code?: string | null
          confidence?: number | null
          created_at?: string
          executed_at: string
          fee?: number
          id?: string
          linked_check_id?: string | null
          note?: Json | null
          owner: string
          price?: number
          quantity?: number
          realized_pnl?: number | null
          return_rate?: number | null
          side: Database["public"]["Enums"]["trade_side"]
          source?: Database["public"]["Enums"]["trade_source"]
          symbol: string
          tax?: number
          tax_deductible?: boolean
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          broker?: string | null
          code?: string | null
          confidence?: number | null
          created_at?: string
          executed_at?: string
          fee?: number
          id?: string
          linked_check_id?: string | null
          note?: Json | null
          owner?: string
          price?: number
          quantity?: number
          realized_pnl?: number | null
          return_rate?: number | null
          side?: Database["public"]["Enums"]["trade_side"]
          source?: Database["public"]["Enums"]["trade_source"]
          symbol?: string
          tax?: number
          tax_deductible?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calc_fifo_on_sell: {
        Args: { p_sell_trade_id: string }
        Returns: undefined
      }
    }
    Enums: {
      account_type: "general" | "isa" | "pension" | "irp" | "irp_dc"
      trade_side: "buy" | "sell" | "deposit" | "withdrawal"
      trade_source: "vision" | "manual" | "opening" | "api"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      account_type: ["general", "isa", "pension", "irp", "irp_dc"],
      trade_side: ["buy", "sell", "deposit", "withdrawal"],
      trade_source: ["vision", "manual", "opening", "api"],
    },
  },
} as const
