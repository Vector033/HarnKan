
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "expenses": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"deleted": boolean,"id": string,"paid_by": string,"spent_at": string,"split": NonNullable<Json>,"split_mode": string,"title": string,"trip_id": string,"updated_at": string,"updated_by": string | null,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"deleted"?: boolean,"id": string,"paid_by": string,"spent_at"?: string,"split": NonNullable<Json>,"split_mode": string,"title": string,"trip_id": string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"deleted"?: boolean,"id"?: string,"paid_by"?: string,"spent_at"?: string,"split"?: NonNullable<Json>,"split_mode"?: string,"title"?: string,"trip_id"?: string,"updated_at"?: string,"updated_by"?: string | null,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_trip_id_paid_by_fkey"
      columns: ["trip_id","paid_by"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["trip_id","id"]
    }
                  ]
                },"members": {
                  Row: {
                    "created_at": string,"id": string,"nickname": string,"payee_name": string | null,"pending_user_id": string | null,"promptpay_id": string | null,"trip_id": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"nickname": string,"payee_name"?: string | null,"pending_user_id"?: string | null,"promptpay_id"?: string | null,"trip_id": string,"user_id"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"nickname"?: string,"payee_name"?: string | null,"pending_user_id"?: string | null,"promptpay_id"?: string | null,"trip_id"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "members_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"payments": {
                  Row: {
                    "amount": number,"created_at": string,"created_by": string | null,"decided_at": string | null,"decided_by": string | null,"from_member": string,"id": string,"slip": Json | null,"source": string,"status": string,"to_member": string,"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"from_member": string,"id": string,"slip"?: Json | null,"source": string,"status": string,"to_member": string,"trip_id": string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"created_by"?: string | null,"decided_at"?: string | null,"decided_by"?: string | null,"from_member"?: string,"id"?: string,"slip"?: Json | null,"source"?: string,"status"?: string,"to_member"?: string,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_trip_id_from_member_fkey"
      columns: ["trip_id","from_member"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["trip_id","id"]
    },{
      foreignKeyName: "payments_trip_id_to_member_fkey"
      columns: ["trip_id","to_member"]
isOneToOne: false
      referencedRelation: "members"
      referencedColumns: ["trip_id","id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "nickname": string | null,"payee_name": string | null,"promptpay_id": string | null,"updated_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "nickname"?: string | null,"payee_name"?: string | null,"promptpay_id"?: string | null,"updated_at"?: string,"user_id": string
                  }
                  Update: {
                    "nickname"?: string | null,"payee_name"?: string | null,"promptpay_id"?: string | null,"updated_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"slip_reads": {
                  Row: {
                    "read_at": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "read_at"?: string,"user_id": string
                  }
                  Update: {
                    "read_at"?: string,"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"trip_bans": {
                  Row: {
                    "banned_at": string,"trip_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "banned_at"?: string,"trip_id": string,"user_id": string
                  }
                  Update: {
                    "banned_at"?: string,"trip_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "trip_bans_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"invite_code": string,"invite_expires_at": string,"locked": boolean,"name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"id"?: string,"invite_code": string,"invite_expires_at"?: string,"locked"?: boolean,"name": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"invite_code"?: string,"invite_expires_at"?: string,"locked"?: boolean,"name"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "create_trip":
{ Args: { "p_name": string,"p_nickname": string }; Returns: Json
                           },
"decide_claim":
{ Args: { "p_accept": boolean,"p_member": string }; Returns: undefined
                           },
"decide_payment":
{ Args: { "p_decision": string,"p_id": string }; Returns: Json
                           },
"delete_expense":
{ Args: { "p_base_version": number,"p_id": string }; Returns: Json
                           },
"is_trip_member":
{ Args: { "t": string }; Returns: boolean
                           },
"join_trip":
{ Args: { "p_code": string,"p_member_id"?: string,"p_nickname"?: string }; Returns: Json
                           },
"new_invite_code":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"note_slip_read":
{ Args: { "p_limit"?: number }; Returns: undefined
                           },
"record_payment":
{ Args: { "p_payment": Json }; Returns: Json
                           },
"record_payment_as":
{ Args: { "p_payment": Json,"p_slip": Json,"p_user": string }; Returns: Json
                           },
"record_slip_payment":
{ Args: { "p_payment": Json,"p_slip": Json,"p_user": string }; Returns: Json
                           },
"remove_member":
{ Args: { "p_member": string }; Returns: undefined
                           },
"require_creator":
{ Args: { "t": string }; Returns: undefined
                           },
"require_member":
{ Args: { "t": string }; Returns: undefined
                           },
"require_user":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"rotate_invite":
{ Args: { "p_trip": string }; Returns: string
                           },
"save_expense":
{ Args: { "p_base_version"?: number,"p_expense": Json }; Returns: Json
                           },
"set_trip_locked":
{ Args: { "p_locked": boolean,"p_trip": string }; Returns: undefined
                           },
"trip_has_room":
{ Args: { "t": string }; Returns: boolean
                           },
"trip_preview":
{ Args: { "p_code": string }; Returns: Json
                           },
"validate_split":
{ Args: { "p_amount": number,"p_mode": string,"p_split": Json,"p_trip": string }; Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
