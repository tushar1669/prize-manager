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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      allocations: {
        Row: {
          created_at: string | null
          decided_at: string | null
          decided_by: string | null
          id: string
          is_manual: boolean | null
          player_id: string | null
          prize_id: string | null
          reason_codes: string[]
          tournament_id: string
          version: number
        }
        Insert: {
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          is_manual?: boolean | null
          player_id?: string | null
          prize_id?: string | null
          reason_codes?: string[]
          tournament_id: string
          version?: number
        }
        Update: {
          created_at?: string | null
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          is_manual?: boolean | null
          player_id?: string | null
          prize_id?: string | null
          reason_codes?: string[]
          tournament_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "allocations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "published_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          context: Json
          created_at: string
          event_type: string
          friendly_message: string | null
          id: string
          message: string
          reference_id: string
          route: string | null
          severity: string
          suggested_action: string | null
          user_email_hash: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json
          created_at?: string
          event_type: string
          friendly_message?: string | null
          id?: string
          message: string
          reference_id: string
          route?: string | null
          severity?: string
          suggested_action?: string | null
          user_email_hash?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json
          created_at?: string
          event_type?: string
          friendly_message?: string | null
          id?: string
          message?: string
          reference_id?: string
          route?: string | null
          severity?: string
          suggested_action?: string | null
          user_email_hash?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string | null
          criteria_json: Json
          id: string
          is_active: boolean
          is_main: boolean | null
          name: string
          order_idx: number | null
          tournament_id: string
        }
        Insert: {
          created_at?: string | null
          criteria_json?: Json
          id?: string
          is_active?: boolean
          is_main?: boolean | null
          name: string
          order_idx?: number | null
          tournament_id: string
        }
        Update: {
          created_at?: string | null
          criteria_json?: Json
          id?: string
          is_active?: boolean
          is_main?: boolean | null
          name?: string
          order_idx?: number | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "published_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      conflict_decisions: {
        Row: {
          conflict_id: string
          decided_at: string | null
          decided_by: string | null
          decision: Json | null
          id: string
          note: string | null
        }
        Insert: {
          conflict_id: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Json | null
          id?: string
          note?: string | null
        }
        Update: {
          conflict_id?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Json | null
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conflict_decisions_conflict_id_fkey"
            columns: ["conflict_id"]
            isOneToOne: false
            referencedRelation: "conflicts"
            referencedColumns: ["id"]
          },
        ]
      }
      conflicts: {
        Row: {
          created_at: string | null
          id: string
          impacted_players: string[]
          impacted_prizes: string[]
          reasons: string[]
          status: string
          suggested: Json | null
          tournament_id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          impacted_players?: string[]
          impacted_prizes?: string[]
          reasons?: string[]
          status?: string
          suggested?: Json | null
          tournament_id: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          impacted_players?: string[]
          impacted_prizes?: string[]
          reasons?: string[]
          status?: string
          suggested?: Json | null
          tournament_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conflicts_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "published_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conflicts_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          amount_after: number | null
          amount_before: number | null
          coupon_id: string
          discount_amount: number
          id: string
          issued_to_email: string | null
          issued_to_user_id: string | null
          meta: Json
          redeemed_at: string
          redeemed_by_user_id: string | null
          tournament_id: string | null
          user_id: string
        }
        Insert: {
          amount_after?: number | null
          amount_before?: number | null
          coupon_id: string
          discount_amount?: number
          id?: string
          issued_to_email?: string | null
          issued_to_user_id?: string | null
          meta?: Json
          redeemed_at?: string
          redeemed_by_user_id?: string | null
          tournament_id?: string | null
          user_id: string
        }
        Update: {
          amount_after?: number | null
          amount_before?: number | null
          coupon_id?: string
          discount_amount?: number
          id?: string
          issued_to_email?: string | null
          issued_to_user_id?: string | null
          meta?: Json
          redeemed_at?: string
          redeemed_by_user_id?: string | null
          tournament_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "published_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applies_to: string
          code: string
          created_at: string
          created_by: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          issued_to_email: string | null
          issued_to_user_id: string | null
          max_redemptions: number | null
          max_redemptions_per_user: number | null
          origin: string | null
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          applies_to?: string
          code: string
          created_at?: string
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          issued_to_email?: string | null
          issued_to_user_id?: string | null
          max_redemptions?: number | null
          max_redemptions_per_user?: number | null
          origin?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          applies_to?: string
          code?: string
          created_at?: string
          created_by?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          issued_to_email?: string | null
          issued_to_user_id?: string | null
          max_redemptions?: number | null
          max_redemptions_per_user?: number | null
          origin?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      import_logs: {
        Row: {
          accepted_rows: number
          duration_ms: number | null
          file_hash: string | null
          filename: string | null
          header_row: number | null
          id: string
          imported_at: string
          imported_by: string | null
          meta: Json
          sample_errors: Json
          sheet_name: string | null
          skipped_rows: number
          source: string | null
          top_reasons: Json
          total_rows: number
          tournament_id: string
        }
        Insert: {
          accepted_rows?: number
          duration_ms?: number | null
          file_hash?: string | null
          filename?: string | null
          header_row?: number | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          meta?: Json
          sample_errors?: Json
          sheet_name?: string | null
          skipped_rows?: number
          source?: string | null
          top_reasons?: Json
          total_rows?: number
          tournament_id: string
        }
        Update: {
          accepted_rows?: number
          duration_ms?: number | null
          file_hash?: string | null
          filename?: string | null
          header_row?: number | null
          id?: string
          imported_at?: string
          imported_by?: string | null
          meta?: Json
          sample_errors?: Json
          sheet_name?: string | null
          skipped_rows?: number
          source?: string | null
          top_reasons?: Json
          total_rows?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_logs_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "published_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_logs_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      institution_prize_groups: {
        Row: {
          created_at: string | null
          female_slots: number
          group_by: string
          id: string
          is_active: boolean
          male_slots: number
          name: string
          scoring_mode: string
          team_size: number
          tournament_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          female_slots?: number
          group_by: string
          id?: string
          is_active?: boolean
          male_slots?: number
          name: string
          scoring_mode?: string
          team_size: number
          tournament_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          female_slots?: number
          group_by?: string
          id?: string
          is_active?: boolean
          male_slots?: number
          name?: string
          scoring_mode?: string
          team_size?: number
          tournament_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "institution_prize_groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "published_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "institution_prize_groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      institution_prizes: {
        Row: {
          cash_amount: number
          created_at: string | null
          group_id: string
          has_medal: boolean
          has_trophy: boolean
          id: string
          is_active: boolean
          place: number
        }
        Insert: {
          cash_amount?: number
          created_at?: string | null
          group_id: string
          has_medal?: boolean
          has_trophy?: boolean
          id?: string
          is_active?: boolean
          place: number
        }
        Update: {
          cash_amount?: number
          created_at?: string | null
          group_id?: string
          has_medal?: boolean
          has_trophy?: boolean
          id?: string
          is_active?: boolean
          place?: number
        }
        Relationships: [
          {
            foreignKeyName: "institution_prizes_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "institution_prize_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      master_allowlist: {
        Row: {
          created_at: string | null
          email: string
        }
        Insert: {
          created_at?: string | null
          email: string
        }
        Update: {
          created_at?: string | null
          email?: string
        }
        Relationships: []
      }
      players: {
        Row: {
          city: string | null
          club: string | null
          created_at: string | null
          disability: string | null
          dob: string | null
          dob_raw: string | null
          federation: string | null
          fide_id: string | null
          full_name: string | null
          gender: string | null
          group_label: string | null
          id: string
          name: string
          rank: number
          rating: number | null
          sno: string | null
          special_notes: string | null
          state: string | null
          tags_json: Json | null
          tournament_id: string
          type_label: string | null
          unrated: boolean
          updated_at: string | null
          warnings_json: Json | null
        }
        Insert: {
          city?: string | null
          club?: string | null
          created_at?: string | null
          disability?: string | null
          dob?: string | null
          dob_raw?: string | null
          federation?: string | null
          fide_id?: string | null
          full_name?: string | null
          gender?: string | null
          group_label?: string | null
          id?: string
          name: string
          rank: number
          rating?: number | null
          sno?: string | null
          special_notes?: string | null
          state?: string | null
          tags_json?: Json | null
          tournament_id: string
          type_label?: string | null
          unrated?: boolean
          updated_at?: string | null
          warnings_json?: Json | null
        }
        Update: {
          city?: string | null
          club?: string | null
          created_at?: string | null
          disability?: string | null
          dob?: string | null
          dob_raw?: string | null
          federation?: string | null
          fide_id?: string | null
          full_name?: string | null
          gender?: string | null
          group_label?: string | null
          id?: string
          name?: string
          rank?: number
          rating?: number | null
          sno?: string | null
          special_notes?: string | null
          state?: string | null
          tags_json?: Json | null
          tournament_id?: string
          type_label?: string | null
          unrated?: boolean
          updated_at?: string | null
          warnings_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "published_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      prizes: {
        Row: {
          cash_amount: number | null
          category_id: string
          created_at: string | null
          gift_items: Json
          has_medal: boolean | null
          has_trophy: boolean | null
          id: string
          is_active: boolean
          place: number
        }
        Insert: {
          cash_amount?: number | null
          category_id: string
          created_at?: string | null
          gift_items?: Json
          has_medal?: boolean | null
          has_trophy?: boolean | null
          id?: string
          is_active?: boolean
          place: number
        }
        Update: {
          cash_amount?: number | null
          category_id?: string
          created_at?: string | null
          gift_items?: Json
          has_medal?: boolean | null
          has_trophy?: boolean | null
          id?: string
          is_active?: boolean
          place?: number
        }
        Relationships: [
          {
            foreignKeyName: "prizes_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          city: string | null
          created_at: string | null
          display_name: string | null
          email: string
          fide_arbiter_id: string | null
          id: string
          org_name: string | null
          phone: string | null
          profile_completed_at: string | null
          profile_reward_claimed: boolean
          website: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          display_name?: string | null
          email: string
          fide_arbiter_id?: string | null
          id: string
          org_name?: string | null
          phone?: string | null
          profile_completed_at?: string | null
          profile_reward_claimed?: boolean
          website?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string | null
          display_name?: string | null
          email?: string
          fide_arbiter_id?: string | null
          id?: string
          org_name?: string | null
          phone?: string | null
          profile_completed_at?: string | null
          profile_reward_claimed?: boolean
          website?: string | null
        }
        Relationships: []
      }
      publications: {
        Row: {
          id: string
          is_active: boolean | null
          published_at: string | null
          published_by: string | null
          request_id: string | null
          slug: string
          tournament_id: string
          version: number
        }
        Insert: {
          id?: string
          is_active?: boolean | null
          published_at?: string | null
          published_by?: string | null
          request_id?: string | null
          slug: string
          tournament_id: string
          version?: number
        }
        Update: {
          id?: string
          is_active?: boolean | null
          published_at?: string | null
          published_by?: string | null
          request_id?: string | null
          slug?: string
          tournament_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "publications_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "published_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "publications_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_rewards: {
        Row: {
          beneficiary_id: string
          coupon_id: string | null
          created_at: string
          id: string
          level: number
          reward_type: string
          trigger_tournament_id: string
          trigger_user_id: string
        }
        Insert: {
          beneficiary_id: string
          coupon_id?: string | null
          created_at?: string
          id?: string
          level: number
          reward_type?: string
          trigger_tournament_id: string
          trigger_user_id: string
        }
        Update: {
          beneficiary_id?: string
          coupon_id?: string | null
          created_at?: string
          id?: string
          level?: number
          reward_type?: string
          trigger_tournament_id?: string
          trigger_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
        ]
      }
      referrals: {
        Row: {
          created_at: string
          id: string
          referral_code_id: string
          referred_email: string | null
          referred_id: string
          referred_label: string | null
          referrer_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          referral_code_id: string
          referred_email?: string | null
          referred_id: string
          referred_label?: string | null
          referrer_id: string
        }
        Update: {
          created_at?: string
          id?: string
          referral_code_id?: string
          referred_email?: string | null
          referred_id?: string
          referred_label?: string | null
          referrer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrals_referral_code_id_fkey"
            columns: ["referral_code_id"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_config: {
        Row: {
          age_band_policy: string | null
          age_cutoff_date: string | null
          age_cutoff_policy: string
          allow_missing_dob_for_age: boolean | null
          allow_unrated_in_rating: boolean | null
          category_priority_order: Json | null
          created_at: string | null
          main_vs_side_priority_mode: string
          max_age_inclusive: boolean | null
          multi_prize_policy: string | null
          non_cash_priority_mode: string
          prefer_category_rank_on_tie: boolean | null
          prefer_main_on_equal_value: boolean | null
          strict_age: boolean | null
          tournament_id: string
          updated_at: string | null
        }
        Insert: {
          age_band_policy?: string | null
          age_cutoff_date?: string | null
          age_cutoff_policy?: string
          allow_missing_dob_for_age?: boolean | null
          allow_unrated_in_rating?: boolean | null
          category_priority_order?: Json | null
          created_at?: string | null
          main_vs_side_priority_mode?: string
          max_age_inclusive?: boolean | null
          multi_prize_policy?: string | null
          non_cash_priority_mode?: string
          prefer_category_rank_on_tie?: boolean | null
          prefer_main_on_equal_value?: boolean | null
          strict_age?: boolean | null
          tournament_id: string
          updated_at?: string | null
        }
        Update: {
          age_band_policy?: string | null
          age_cutoff_date?: string | null
          age_cutoff_policy?: string
          allow_missing_dob_for_age?: boolean | null
          allow_unrated_in_rating?: boolean | null
          category_priority_order?: Json | null
          created_at?: string | null
          main_vs_side_priority_mode?: string
          max_age_inclusive?: boolean | null
          multi_prize_policy?: string | null
          non_cash_priority_mode?: string
          prefer_category_rank_on_tie?: boolean | null
          prefer_main_on_equal_value?: boolean | null
          strict_age?: boolean | null
          tournament_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rule_config_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "published_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_config_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: true
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_entitlements: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          owner_id: string
          source: string
          source_ref: string
          starts_at: string
          tournament_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          owner_id: string
          source: string
          source_ref: string
          starts_at: string
          tournament_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          owner_id?: string
          source?: string
          source_ref?: string
          starts_at?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_entitlements_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "published_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_entitlements_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_entitlements_tournament_owner_fkey"
            columns: ["tournament_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id", "owner_id"]
          },
        ]
      }
      tournament_payments: {
        Row: {
          amount_inr: number
          created_at: string
          id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["payment_status"]
          tournament_id: string
          user_id: string
          utr: string
        }
        Insert: {
          amount_inr: number
          created_at?: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tournament_id: string
          user_id: string
          utr: string
        }
        Update: {
          amount_inr?: number
          created_at?: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          tournament_id?: string
          user_id?: string
          utr?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_payments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "published_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_payments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          brochure_url: string | null
          cash_prize_total: number | null
          chessresults_url: string | null
          chief_arbiter: string | null
          city: string | null
          created_at: string | null
          deleted_at: string | null
          end_date: string
          entry_fee_amount: number | null
          event_code: string | null
          id: string
          is_archived: boolean
          is_published: boolean
          latest_import_quality: Json | null
          notes: string | null
          owner_id: string
          public_results_url: string | null
          public_slug: string | null
          slug: string | null
          start_date: string
          status: string
          time_control_base_minutes: number | null
          time_control_category: string | null
          time_control_increment_seconds: number | null
          title: string
          tournament_director: string | null
          updated_at: string | null
          venue: string | null
          verification_skipped: boolean | null
        }
        Insert: {
          brochure_url?: string | null
          cash_prize_total?: number | null
          chessresults_url?: string | null
          chief_arbiter?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          end_date: string
          entry_fee_amount?: number | null
          event_code?: string | null
          id?: string
          is_archived?: boolean
          is_published?: boolean
          latest_import_quality?: Json | null
          notes?: string | null
          owner_id: string
          public_results_url?: string | null
          public_slug?: string | null
          slug?: string | null
          start_date: string
          status?: string
          time_control_base_minutes?: number | null
          time_control_category?: string | null
          time_control_increment_seconds?: number | null
          title: string
          tournament_director?: string | null
          updated_at?: string | null
          venue?: string | null
          verification_skipped?: boolean | null
        }
        Update: {
          brochure_url?: string | null
          cash_prize_total?: number | null
          chessresults_url?: string | null
          chief_arbiter?: string | null
          city?: string | null
          created_at?: string | null
          deleted_at?: string | null
          end_date?: string
          entry_fee_amount?: number | null
          event_code?: string | null
          id?: string
          is_archived?: boolean
          is_published?: boolean
          latest_import_quality?: Json | null
          notes?: string | null
          owner_id?: string
          public_results_url?: string | null
          public_slug?: string | null
          slug?: string | null
          start_date?: string
          status?: string
          time_control_base_minutes?: number | null
          time_control_category?: string | null
          time_control_increment_seconds?: number | null
          title?: string
          tournament_director?: string | null
          updated_at?: string | null
          venue?: string | null
          verification_skipped?: boolean | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          is_verified: boolean
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_verified?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_verified?: boolean
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      profile_completion: {
        Row: {
          filled_count: number | null
          profile_completed_at: string | null
          profile_reward_claimed: boolean | null
          total_count: number | null
          user_id: string | null
        }
        Insert: {
          filled_count?: never
          profile_completed_at?: string | null
          profile_reward_claimed?: boolean | null
          total_count?: never
          user_id?: string | null
        }
        Update: {
          filled_count?: never
          profile_completed_at?: string | null
          profile_reward_claimed?: boolean | null
          total_count?: never
          user_id?: string | null
        }
        Relationships: []
      }
      published_tournaments: {
        Row: {
          brochure_url: string | null
          cash_prize_total: number | null
          chessresults_url: string | null
          chief_arbiter: string | null
          city: string | null
          created_at: string | null
          end_date: string | null
          entry_fee_amount: number | null
          event_code: string | null
          id: string | null
          is_published: boolean | null
          notes: string | null
          public_results_url: string | null
          public_slug: string | null
          publication_slug: string | null
          published_at: string | null
          slug: string | null
          start_date: string | null
          time_control_base_minutes: number | null
          time_control_category: string | null
          time_control_increment_seconds: number | null
          title: string | null
          tournament_director: string | null
          venue: string | null
          version: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      admin_create_coupon: {
        Args: {
          _applies_to: string
          _code: string
          _discount_type: string
          _discount_value: number
          _ends_at: string
          _is_active: boolean
          _issued_to_email: string
          _issued_to_user_id: string
          _max_redemptions: number
          _max_redemptions_per_user: number
          _starts_at: string
        }
        Returns: string
      }
      admin_list_coupons: {
        Args: never
        Returns: {
          applies_to: string
          code: string
          created_at: string
          created_by: string
          discount_type: string
          discount_value: number
          ends_at: string
          id: string
          is_active: boolean
          issued_to_email: string
          issued_to_user_id: string
          max_redemptions: number
          max_redemptions_per_user: number
          starts_at: string
          updated_at: string
        }[]
      }
      apply_coupon_for_tournament: {
        Args: { amount_before: number; code: string; tournament_id: string }
        Returns: {
          amount_after: number
          discount_amount: number
          is_valid: boolean
          reason: string
        }[]
      }
      apply_referral_code: { Args: { referral_code: string }; Returns: Json }
      bootstrap_master: { Args: never; Returns: Json }
      claim_profile_completion_reward: { Args: never; Returns: Json }
      coupon_origin_from_code: { Args: { code: string }; Returns: string }
      get_or_create_my_referral_code: { Args: never; Returns: Json }
      get_public_tournament_results: {
        Args: { tournament_id: string }
        Returns: {
          cash_amount: number
          category_name: string
          has_full_access: boolean
          has_medal: boolean
          has_trophy: boolean
          is_main: boolean
          other_categories_locked: boolean
          place: number
          player_name: string
          preview_main_limit: number
          prize_id: string
          rank: number
          rating: number
          state: string
        }[]
      }
      get_tournament_access_state: {
        Args: { tournament_id: string }
        Returns: {
          has_full_access: boolean
          is_free_small_tournament: boolean
          players_count: number
          preview_main_limit: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      import_dedup_candidates: {
        Args: { candidates: Json; tournament_id: string }
        Returns: Json
      }
      import_replace_players: {
        Args: { players: Json; tournament_id: string }
        Returns: {
          error_rows: Json
          inserted_count: number
        }[]
      }
      is_master:
        | { Args: never; Returns: boolean }
        | { Args: { uid: string }; Returns: boolean }
      issue_referral_rewards: {
        Args: { p_trigger_tournament_id: string; p_trigger_user_id: string }
        Returns: Json
      }
      list_my_tournaments: {
        Args: { include_all?: boolean }
        Returns: {
          brochure_url: string | null
          cash_prize_total: number | null
          chessresults_url: string | null
          chief_arbiter: string | null
          city: string | null
          created_at: string | null
          deleted_at: string | null
          end_date: string
          entry_fee_amount: number | null
          event_code: string | null
          id: string
          is_archived: boolean
          is_published: boolean
          latest_import_quality: Json | null
          notes: string | null
          owner_id: string
          public_results_url: string | null
          public_slug: string | null
          slug: string | null
          start_date: string
          status: string
          time_control_base_minutes: number | null
          time_control_category: string | null
          time_control_increment_seconds: number | null
          title: string
          tournament_director: string | null
          updated_at: string | null
          venue: string | null
          verification_skipped: boolean | null
        }[]
        SetofOptions: {
          from: "*"
          to: "tournaments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      normalize_dob_input: { Args: { in_raw: string }; Returns: string }
      publish_tournament: {
        Args: { requested_slug?: string; tournament_id: string }
        Returns: {
          request_id: string
          slug: string
          version: number
        }[]
      }
      redeem_coupon_for_tournament: {
        Args: { amount_before: number; code: string; tournament_id: string }
        Returns: {
          amount_after: number
          discount_amount: number
          reason: string
        }[]
      }
      review_tournament_payment: {
        Args: { p_decision: string; p_note?: string; p_payment_id: string }
        Returns: Json
      }
      submit_tournament_payment_claim: {
        Args: { p_amount_inr: number; p_tournament_id: string; p_utr: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "master" | "organizer" | "user"
      payment_status: "pending" | "approved" | "rejected"
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
      app_role: ["master", "organizer", "user"],
      payment_status: ["pending", "approved", "rejected"],
    },
  },
} as const
