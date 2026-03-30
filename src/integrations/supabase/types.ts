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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      analysis_chunks: {
        Row: {
          chunk_index: number
          created_at: string
          end_sec: number
          id: string
          overlap_end_sec: number | null
          overlap_start_sec: number | null
          pegasus_response: Json | null
          project_id: string
          start_sec: number
          status: Database["public"]["Enums"]["chunk_status"]
        }
        Insert: {
          chunk_index: number
          created_at?: string
          end_sec: number
          id?: string
          overlap_end_sec?: number | null
          overlap_start_sec?: number | null
          pegasus_response?: Json | null
          project_id: string
          start_sec: number
          status?: Database["public"]["Enums"]["chunk_status"]
        }
        Update: {
          chunk_index?: number
          created_at?: string
          end_sec?: number
          id?: string
          overlap_end_sec?: number | null
          overlap_start_sec?: number | null
          pegasus_response?: Json | null
          project_id?: string
          start_sec?: number
          status?: Database["public"]["Enums"]["chunk_status"]
        }
        Relationships: [
          {
            foreignKeyName: "analysis_chunks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      analysis_logs: {
        Row: {
          created_at: string
          id: string
          log_type: Database["public"]["Enums"]["analysis_log_type"]
          message: string | null
          project_id: string
          raw_data: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          log_type: Database["public"]["Enums"]["analysis_log_type"]
          message?: string | null
          project_id: string
          raw_data?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          log_type?: Database["public"]["Enums"]["analysis_log_type"]
          message?: string | null
          project_id?: string
          raw_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "analysis_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      breakpoints: {
        Row: {
          ad_slot_duration_rec: number | null
          approval_status: string
          boundary_reasons: Json | null
          compliance_notes: string | null
          confidence: number | null
          id: string
          lead_in_sec: number | null
          project_id: string
          reason: string | null
          timestamp_sec: number
          type: string | null
          valley_type: string | null
        }
        Insert: {
          ad_slot_duration_rec?: number | null
          approval_status?: string
          boundary_reasons?: Json | null
          compliance_notes?: string | null
          confidence?: number | null
          id?: string
          lead_in_sec?: number | null
          project_id: string
          reason?: string | null
          timestamp_sec: number
          type?: string | null
          valley_type?: string | null
        }
        Update: {
          ad_slot_duration_rec?: number | null
          approval_status?: string
          boundary_reasons?: Json | null
          compliance_notes?: string | null
          confidence?: number | null
          id?: string
          lead_in_sec?: number | null
          project_id?: string
          reason?: string | null
          timestamp_sec?: number
          type?: string | null
          valley_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "breakpoints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      exports: {
        Row: {
          created_at: string
          file_url: string | null
          id: string
          project_id: string
          type: Database["public"]["Enums"]["export_type"]
        }
        Insert: {
          created_at?: string
          file_url?: string | null
          id?: string
          project_id: string
          type: Database["public"]["Enums"]["export_type"]
        }
        Update: {
          created_at?: string
          file_url?: string | null
          id?: string
          project_id?: string
          type?: Database["public"]["Enums"]["export_type"]
        }
        Relationships: [
          {
            foreignKeyName: "exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      highlights: {
        Row: {
          clip_url: string | null
          end_sec: number
          id: string
          project_id: string
          rank_order: number | null
          reason: string | null
          score: number | null
          start_sec: number
        }
        Insert: {
          clip_url?: string | null
          end_sec: number
          id?: string
          project_id: string
          rank_order?: number | null
          reason?: string | null
          score?: number | null
          start_sec: number
        }
        Update: {
          clip_url?: string | null
          end_sec?: number
          id?: string
          project_id?: string
          rank_order?: number | null
          reason?: string | null
          score?: number | null
          start_sec?: number
        }
        Relationships: [
          {
            foreignKeyName: "highlights_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          content_metadata: Json | null
          content_type: Database["public"]["Enums"]["content_type"] | null
          created_at: string
          delivery_target: string | null
          duration_sec: number | null
          file_size_bytes: number | null
          id: string
          status: Database["public"]["Enums"]["project_status"]
          title: string
        }
        Insert: {
          content_metadata?: Json | null
          content_type?: Database["public"]["Enums"]["content_type"] | null
          created_at?: string
          delivery_target?: string | null
          duration_sec?: number | null
          file_size_bytes?: number | null
          id?: string
          status?: Database["public"]["Enums"]["project_status"]
          title: string
        }
        Update: {
          content_metadata?: Json | null
          content_type?: Database["public"]["Enums"]["content_type"] | null
          created_at?: string
          delivery_target?: string | null
          duration_sec?: number | null
          file_size_bytes?: number | null
          id?: string
          status?: Database["public"]["Enums"]["project_status"]
          title?: string
        }
        Relationships: []
      }
      segments: {
        Row: {
          confidence: number | null
          end_sec: number
          id: string
          project_id: string
          start_sec: number
          summary: string | null
          type: Database["public"]["Enums"]["segment_type"]
        }
        Insert: {
          confidence?: number | null
          end_sec: number
          id?: string
          project_id: string
          start_sec: number
          summary?: string | null
          type: Database["public"]["Enums"]["segment_type"]
        }
        Update: {
          confidence?: number | null
          end_sec?: number
          id?: string
          project_id?: string
          start_sec?: number
          summary?: string | null
          type?: Database["public"]["Enums"]["segment_type"]
        }
        Relationships: [
          {
            foreignKeyName: "segments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          duration_sec: number | null
          id: string
          original_filename: string
          project_id: string
          s3_uri: string | null
        }
        Insert: {
          duration_sec?: number | null
          id?: string
          original_filename: string
          project_id: string
          s3_uri?: string | null
        }
        Update: {
          duration_sec?: number | null
          id?: string
          original_filename?: string
          project_id?: string
          s3_uri?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_signups: {
        Row: {
          created_at: string
          email: string
          id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      analysis_log_type:
        | "skipped_segment"
        | "skipped_highlight"
        | "skipped_breakpoint"
        | "clamped_score"
        | "parse_error"
        | "info"
      chunk_status: "pending" | "analyzing" | "complete" | "failed"
      content_type: "short_form" | "tv_episode" | "feature_film"
      export_type: "json" | "reel"
      project_status:
        | "draft"
        | "uploaded"
        | "analyzing"
        | "ready"
        | "failed"
        | "generating_reel"
        | "complete"
        | "segments_done"
        | "highlights_done"
        | "archived"
      segment_type:
        | "opening"
        | "climax"
        | "story_unit"
        | "transition"
        | "resolution"
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
      analysis_log_type: [
        "skipped_segment",
        "skipped_highlight",
        "skipped_breakpoint",
        "clamped_score",
        "parse_error",
        "info",
      ],
      chunk_status: ["pending", "analyzing", "complete", "failed"],
      content_type: ["short_form", "tv_episode", "feature_film"],
      export_type: ["json", "reel"],
      project_status: [
        "draft",
        "uploaded",
        "analyzing",
        "ready",
        "failed",
        "generating_reel",
        "complete",
        "segments_done",
        "highlights_done",
        "archived",
      ],
      segment_type: [
        "opening",
        "climax",
        "story_unit",
        "transition",
        "resolution",
      ],
    },
  },
} as const
