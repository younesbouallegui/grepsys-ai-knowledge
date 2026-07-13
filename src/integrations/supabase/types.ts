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
      assessment_results: {
        Row: {
          assessment_id: string
          attempt_id: string | null
          id: string
          level: Database["public"]["Enums"]["skill_level"]
          score: number
          skills: Json
          submitted_at: string
          user_id: string
        }
        Insert: {
          assessment_id: string
          attempt_id?: string | null
          id?: string
          level: Database["public"]["Enums"]["skill_level"]
          score: number
          skills?: Json
          submitted_at?: string
          user_id: string
        }
        Update: {
          assessment_id?: string
          attempt_id?: string | null
          id?: string
          level?: Database["public"]["Enums"]["skill_level"]
          score?: number
          skills?: Json
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_results_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_results_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "quiz_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_violations: {
        Row: {
          attempt_id: string | null
          created_at: string
          details: Json | null
          id: string
          quiz_id: string
          user_id: string
          violation_type: string
        }
        Insert: {
          attempt_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          quiz_id: string
          user_id: string
          violation_type: string
        }
        Update: {
          attempt_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          quiz_id?: string
          user_id?: string
          violation_type?: string
        }
        Relationships: []
      }
      certifications: {
        Row: {
          attempts_count: number
          awarded_at: string
          best_score: number
          category: string
          id: string
          level: Database["public"]["Enums"]["skill_level"]
          user_id: string
        }
        Insert: {
          attempts_count?: number
          awarded_at?: string
          best_score?: number
          category: string
          id?: string
          level: Database["public"]["Enums"]["skill_level"]
          user_id: string
        }
        Update: {
          attempts_count?: number
          awarded_at?: string
          best_score?: number
          category?: string
          id?: string
          level?: Database["public"]["Enums"]["skill_level"]
          user_id?: string
        }
        Relationships: []
      }
      document_chunks: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          slug: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          slug: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          slug?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          preferred_language: string
          updated_at: string
          zabbix_email: string | null
          zabbix_groups: Json | null
          zabbix_name: string | null
          zabbix_role_id: string | null
          zabbix_surname: string | null
          zabbix_userid: string | null
          zabbix_username: string | null
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
          preferred_language?: string
          updated_at?: string
          zabbix_email?: string | null
          zabbix_groups?: Json | null
          zabbix_name?: string | null
          zabbix_role_id?: string | null
          zabbix_surname?: string | null
          zabbix_userid?: string | null
          zabbix_username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          preferred_language?: string
          updated_at?: string
          zabbix_email?: string | null
          zabbix_groups?: Json | null
          zabbix_name?: string | null
          zabbix_role_id?: string | null
          zabbix_surname?: string | null
          zabbix_userid?: string | null
          zabbix_username?: string | null
        }
        Relationships: []
      }
      quiz_attempts: {
        Row: {
          answers: Json
          completed_at: string
          id: string
          level: Database["public"]["Enums"]["skill_level"]
          quiz_id: string
          score: number
          user_id: string
          weak_areas: Json | null
        }
        Insert: {
          answers?: Json
          completed_at?: string
          id?: string
          level?: Database["public"]["Enums"]["skill_level"]
          quiz_id: string
          score?: number
          user_id: string
          weak_areas?: Json | null
        }
        Update: {
          answers?: Json
          completed_at?: string
          id?: string
          level?: Database["public"]["Enums"]["skill_level"]
          quiz_id?: string
          score?: number
          user_id?: string
          weak_areas?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_answer: string
          created_at: string
          explanation: string | null
          id: string
          options: Json
          position: number
          question_text: string
          question_type: Database["public"]["Enums"]["question_type"]
          quiz_id: string
          related_document_id: string | null
          weight: number
        }
        Insert: {
          correct_answer: string
          created_at?: string
          explanation?: string | null
          id?: string
          options: Json
          position?: number
          question_text: string
          question_type?: Database["public"]["Enums"]["question_type"]
          quiz_id: string
          related_document_id?: string | null
          weight?: number
        }
        Update: {
          correct_answer?: string
          created_at?: string
          explanation?: string | null
          id?: string
          options?: Json
          position?: number
          question_text?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          quiz_id?: string
          related_document_id?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_related_document_id_fkey"
            columns: ["related_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          document_id: string | null
          id: string
          passing_score: number
          time_limit_minutes: number | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_id?: string | null
          id?: string
          passing_score?: number
          time_limit_minutes?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          document_id?: string | null
          id?: string
          passing_score?: number
          time_limit_minutes?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      sso_exchange_log: {
        Row: {
          created_at: string
          direction: string
          error: string | null
          id: string
          succeeded: boolean
          username: string | null
          zabbix_user_id: string | null
        }
        Insert: {
          created_at?: string
          direction: string
          error?: string | null
          id?: string
          succeeded: boolean
          username?: string | null
          zabbix_user_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          error?: string | null
          id?: string
          succeeded?: boolean
          username?: string | null
          zabbix_user_id?: string | null
        }
        Relationships: []
      }
      sso_handoff_codes: {
        Row: {
          code_hash: string
          created_at: string
          expires_at: string
          used_at: string | null
          user_id: string
          zabbix_token: string
          zabbix_userid: string
          zabbix_username: string | null
        }
        Insert: {
          code_hash: string
          created_at?: string
          expires_at: string
          used_at?: string | null
          user_id: string
          zabbix_token: string
          zabbix_userid: string
          zabbix_username?: string | null
        }
        Update: {
          code_hash?: string
          created_at?: string
          expires_at?: string
          used_at?: string | null
          user_id?: string
          zabbix_token?: string
          zabbix_userid?: string
          zabbix_username?: string | null
        }
        Relationships: []
      }
      sso_nonces: {
        Row: {
          audience: string
          consumed_at: string
          expires_at: string
          issuer: string
          nonce: string
        }
        Insert: {
          audience: string
          consumed_at?: string
          expires_at: string
          issuer: string
          nonce: string
        }
        Update: {
          audience?: string
          consumed_at?: string
          expires_at?: string
          issuer?: string
          nonce?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_assessment_questions: {
        Args: { p_quiz_id: string }
        Returns: {
          id: string
          options: Json
          question_position: number
          question_text: string
          question_type: Database["public"]["Enums"]["question_type"]
          quiz_id: string
          related_document_id: string
          weight: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      list_assessments: {
        Args: never
        Returns: {
          category: string
          created_at: string
          description: string
          id: string
          passing_score: number
          question_count: number
          time_limit_minutes: number
          title: string
        }[]
      }
      match_document_chunks: {
        Args: { match_count?: number; query_embedding: string }
        Returns: {
          content: string
          document_category: string
          document_id: string
          document_slug: string
          document_title: string
          id: string
          similarity: number
        }[]
      }
      record_assessment_violation: {
        Args: { p_details?: Json; p_quiz_id: string; p_violation_type: string }
        Returns: undefined
      }
      record_assessment_violation_as: {
        Args: {
          p_details?: Json
          p_quiz_id: string
          p_user_id: string
          p_violation_type: string
        }
        Returns: undefined
      }
      score_quiz_attempt: {
        Args: {
          p_answers: Json
          p_auto?: boolean
          p_quiz_id: string
          p_violations_count?: number
        }
        Returns: Json
      }
      score_quiz_attempt_as: {
        Args: {
          p_answers: Json
          p_auto?: boolean
          p_quiz_id: string
          p_user_id: string
          p_violations_count?: number
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "engineer" | "viewer"
      question_type: "multiple_choice" | "scenario"
      skill_level: "beginner" | "intermediate" | "advanced" | "production_ready"
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
      app_role: ["admin", "engineer", "viewer"],
      question_type: ["multiple_choice", "scenario"],
      skill_level: ["beginner", "intermediate", "advanced", "production_ready"],
    },
  },
} as const
