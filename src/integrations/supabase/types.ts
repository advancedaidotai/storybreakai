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
      breakpoints: {
        Row: {
          confidence: number | null
          id: string
          project_id: string
          reason: string | null
          timestamp_sec: number
          type: string | null
        }
        Insert: {
          confidence?: number | null
          id?: string
          project_id: string
          reason?: string | null
          timestamp_sec: number
          type?: string | null
        }
        Update: {
          confidence?: number | null
          id?: string
          project_id?: string
          reason?: string | null
          timestamp_sec?: number
          type?: string | null
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
          created_at: string
          id: string
          status: Database["public"]["Enums"]["project_status"]
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: Database["public"]["Enums"]["project_status"]
          title: string
        }
        Update: {
          created_at?: string
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
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      export_type: "json" | "reel"
      project_status:
        | "draft"
        | "uploaded"
        | "analyzing"
        | "ready"
        | "failed"
        | "generating_reel"
        | "complete"
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
      export_type: ["json", "reel"],
      project_status: [
        "draft",
        "uploaded",
        "analyzing",
        "ready",
        "failed",
        "generating_reel",
        "complete",
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
