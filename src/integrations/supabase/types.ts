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
      accessories: {
        Row: {
          active: boolean
          category: string
          created_at: string
          description: string | null
          id: string
          images: string[]
          price_cents: number
          sort_order: number
          stock: number
          title: string
          updated_at: string
          variants: Json
        }
        Insert: {
          active?: boolean
          category: string
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          price_cents?: number
          sort_order?: number
          stock?: number
          title: string
          updated_at?: string
          variants?: Json
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          price_cents?: number
          sort_order?: number
          stock?: number
          title?: string
          updated_at?: string
          variants?: Json
        }
        Relationships: []
      }
      activation_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string | null
          group_name: string | null
          group_type: string
          id: string
          is_used: boolean
          used_by_jid: string | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string | null
          group_name?: string | null
          group_type?: string
          id?: string
          is_used?: boolean
          used_by_jid?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string | null
          group_name?: string | null
          group_type?: string
          id?: string
          is_used?: boolean
          used_by_jid?: string | null
        }
        Relationships: []
      }
      addresses: {
        Row: {
          cep: string
          city: string
          complement: string | null
          created_at: string
          id: string
          is_default: boolean
          label: string | null
          neighborhood: string
          number: string
          recipient_name: string
          state: string
          street: string
          user_id: string
        }
        Insert: {
          cep: string
          city: string
          complement?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          neighborhood: string
          number: string
          recipient_name: string
          state: string
          street: string
          user_id: string
        }
        Update: {
          cep?: string
          city?: string
          complement?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          neighborhood?: string
          number?: string
          recipient_name?: string
          state?: string
          street?: string
          user_id?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      arte_em_cards_codes: {
        Row: {
          code: string
          created_at: string
          cycle_end: string
          cycle_start: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          cycle_end: string
          cycle_start: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          cycle_end?: string
          cycle_start?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      auction_bids: {
        Row: {
          amount: number
          announced: boolean
          auction_id: string
          bidder_name: string | null
          created_at: string
          id: string
          item_id: string | null
          item_name: string
          order_id: string | null
          phone: string
          sequence: number
          status: string
        }
        Insert: {
          amount: number
          announced?: boolean
          auction_id: string
          bidder_name?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          item_name: string
          order_id?: string | null
          phone: string
          sequence?: number
          status?: string
        }
        Update: {
          amount?: number
          announced?: boolean
          auction_id?: string
          bidder_name?: string | null
          created_at?: string
          id?: string
          item_id?: string | null
          item_name?: string
          order_id?: string | null
          phone?: string
          sequence?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "auction_bids_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auction_bids_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "auction_items"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_items: {
        Row: {
          auction_id: string
          bid_increment: number
          buyout_price: number | null
          created_at: string
          description: string | null
          extra_prices: Json
          final_bid: number | null
          id: string
          image_url: string | null
          name: string
          quantity: number
          sequence: number
          starting_price: number
          status: string
          winner_name: string | null
          winner_phone: string | null
        }
        Insert: {
          auction_id: string
          bid_increment?: number
          buyout_price?: number | null
          created_at?: string
          description?: string | null
          extra_prices?: Json
          final_bid?: number | null
          id?: string
          image_url?: string | null
          name: string
          quantity?: number
          sequence?: number
          starting_price?: number
          status?: string
          winner_name?: string | null
          winner_phone?: string | null
        }
        Update: {
          auction_id?: string
          bid_increment?: number
          buyout_price?: number | null
          created_at?: string
          description?: string | null
          extra_prices?: Json
          final_bid?: number | null
          id?: string
          image_url?: string | null
          name?: string
          quantity?: number
          sequence?: number
          starting_price?: number
          status?: string
          winner_name?: string | null
          winner_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "auction_items_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
        ]
      }
      auction_schedules: {
        Row: {
          action: string
          auction_id: string
          created_at: string
          error_message: string | null
          group_jid: string
          id: string
          scheduled_time: string
          status: string
          updated_at: string
        }
        Insert: {
          action: string
          auction_id: string
          created_at?: string
          error_message?: string | null
          group_jid: string
          id?: string
          scheduled_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          action?: string
          auction_id?: string
          created_at?: string
          error_message?: string | null
          group_jid?: string
          id?: string
          scheduled_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auction_schedules_auction_id_fkey"
            columns: ["auction_id"]
            isOneToOne: false
            referencedRelation: "auctions"
            referencedColumns: ["id"]
          },
        ]
      }
      auctions: {
        Row: {
          auction_number: number
          closed_at: string | null
          closing_message: string | null
          created_at: string
          description: string | null
          group_jid: string
          id: string
          scheduled_end: string
          scheduled_start: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          auction_number?: number
          closed_at?: string | null
          closing_message?: string | null
          created_at?: string
          description?: string | null
          group_jid: string
          id?: string
          scheduled_end: string
          scheduled_start: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          auction_number?: number
          closed_at?: string | null
          closing_message?: string | null
          created_at?: string
          description?: string | null
          group_jid?: string
          id?: string
          scheduled_end?: string
          scheduled_start?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          active: boolean
          alt: string | null
          created_at: string
          id: string
          image_url: string
          link_url: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          alt?: string | null
          created_at?: string
          id?: string
          image_url: string
          link_url?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          alt?: string | null
          created_at?: string
          id?: string
          image_url?: string
          link_url?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      bot_command_queue: {
        Row: {
          args: Json
          command: string
          created_at: string
          id: string
          status: string
          target_bot: string | null
          target_group: string | null
          updated_at: string
        }
        Insert: {
          args?: Json
          command: string
          created_at?: string
          id?: string
          status?: string
          target_bot?: string | null
          target_group?: string | null
          updated_at?: string
        }
        Update: {
          args?: Json
          command?: string
          created_at?: string
          id?: string
          status?: string
          target_bot?: string | null
          target_group?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bot_groups: {
        Row: {
          activated_at: string
          group_jid: string
          group_name: string | null
          group_type: string
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string
          group_jid: string
          group_name?: string | null
          group_type?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string
          group_jid?: string
          group_name?: string | null
          group_type?: string
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      bot_instances: {
        Row: {
          bot_number: string | null
          command: string | null
          id: string
          process_name: string
          qr_code_base64: string | null
          status: string
          updated_at: string
        }
        Insert: {
          bot_number?: string | null
          command?: string | null
          id?: string
          process_name: string
          qr_code_base64?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          bot_number?: string | null
          command?: string | null
          id?: string
          process_name?: string
          qr_code_base64?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      card_interest: {
        Row: {
          card_id: string
          created_at: string
          id: string
          last_seen_at: string
          source: string
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          id?: string
          last_seen_at?: string
          source: string
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          last_seen_at?: string
          source?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_interest_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_price_history: {
        Row: {
          card_id: string
          id: string
          price_cents: number
          recorded_at: string
          source: string
        }
        Insert: {
          card_id: string
          id?: string
          price_cents: number
          recorded_at?: string
          source?: string
        }
        Update: {
          card_id?: string
          id?: string
          price_cents?: number
          recorded_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_price_history_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      card_price_watch: {
        Row: {
          card_id: string
          last_min_price_cents: number
          previous_min_price_cents: number | null
          price_dropped_at: string | null
          updated_at: string
        }
        Insert: {
          card_id: string
          last_min_price_cents: number
          previous_min_price_cents?: number | null
          price_dropped_at?: string | null
          updated_at?: string
        }
        Update: {
          card_id?: string
          last_min_price_cents?: number
          previous_min_price_cents?: number | null
          price_dropped_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      card_prices: {
        Row: {
          card_name: string
          card_number: string
          collection: string
          created_at: string
          finish: string
          id: string
          language: string
          last_error: string | null
          price_cents: number | null
          source_url: string | null
          updated_at: string
        }
        Insert: {
          card_name: string
          card_number: string
          collection: string
          created_at?: string
          finish: string
          id?: string
          language: string
          last_error?: string | null
          price_cents?: number | null
          source_url?: string | null
          updated_at?: string
        }
        Update: {
          card_name?: string
          card_number?: string
          collection?: string
          created_at?: string
          finish?: string
          id?: string
          language?: string
          last_error?: string | null
          price_cents?: number | null
          source_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      card_stack_items: {
        Row: {
          auction_date: string | null
          auction_name: string | null
          card_id: string
          card_image: string | null
          card_name: string
          card_number: string | null
          collection: string | null
          condition: string | null
          created_at: string
          finish: string | null
          id: string
          language: string | null
          order_id: string | null
          order_item_id: string | null
          quantity: number
          service_order_id: string | null
          stack_id: string
          status: string
          unit_price_cents: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auction_date?: string | null
          auction_name?: string | null
          card_id: string
          card_image?: string | null
          card_name: string
          card_number?: string | null
          collection?: string | null
          condition?: string | null
          created_at?: string
          finish?: string | null
          id?: string
          language?: string | null
          order_id?: string | null
          order_item_id?: string | null
          quantity: number
          service_order_id?: string | null
          stack_id: string
          status?: string
          unit_price_cents?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auction_date?: string | null
          auction_name?: string | null
          card_id?: string
          card_image?: string | null
          card_name?: string
          card_number?: string | null
          collection?: string | null
          condition?: string | null
          created_at?: string
          finish?: string | null
          id?: string
          language?: string | null
          order_id?: string | null
          order_item_id?: string | null
          quantity?: number
          service_order_id?: string | null
          stack_id?: string
          status?: string
          unit_price_cents?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "card_stack_items_service_order_fk"
            columns: ["service_order_id"]
            isOneToOne: false
            referencedRelation: "service_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "card_stack_items_stack_id_fkey"
            columns: ["stack_id"]
            isOneToOne: false
            referencedRelation: "card_stacks"
            referencedColumns: ["id"]
          },
        ]
      }
      card_stacks: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          reminder_24h_sent_at: string | null
          reminder_48h_sent_at: string | null
          reminder_7d_sent_at: string | null
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          reminder_24h_sent_at?: string | null
          reminder_48h_sent_at?: string | null
          reminder_7d_sent_at?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          reminder_24h_sent_at?: string | null
          reminder_48h_sent_at?: string | null
          reminder_7d_sent_at?: string | null
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      card_stats: {
        Row: {
          card_key: string
          created_at: string
          last_viewed_at: string
          views: number
        }
        Insert: {
          card_key: string
          created_at?: string
          last_viewed_at?: string
          views?: number
        }
        Update: {
          card_key?: string
          created_at?: string
          last_viewed_at?: string
          views?: number
        }
        Relationships: []
      }
      card_stock_changes: {
        Row: {
          card_id: string | null
          card_name: string
          card_number: string
          changed_at: string
          changed_by: string | null
          collection: string
          condition: string | null
          delta: number
          finish: string | null
          id: string
          language: string | null
          new_stock: number
          previous_stock: number
          reason: string | null
        }
        Insert: {
          card_id?: string | null
          card_name: string
          card_number: string
          changed_at?: string
          changed_by?: string | null
          collection: string
          condition?: string | null
          delta: number
          finish?: string | null
          id?: string
          language?: string | null
          new_stock: number
          previous_stock: number
          reason?: string | null
        }
        Update: {
          card_id?: string | null
          card_name?: string
          card_number?: string
          changed_at?: string
          changed_by?: string | null
          collection?: string
          condition?: string | null
          delta?: number
          finish?: string | null
          id?: string
          language?: string | null
          new_stock?: number
          previous_stock?: number
          reason?: string | null
        }
        Relationships: []
      }
      cards: {
        Row: {
          base_price_cents: number | null
          card_number: string
          category: Database["public"]["Enums"]["card_category"]
          collection: string
          condition: Database["public"]["Enums"]["card_condition"]
          created_at: string
          created_by: string | null
          event_reserved: number
          finish: Database["public"]["Enums"]["card_finish"]
          id: string
          illustrator_id: string | null
          image: string
          language: Database["public"]["Enums"]["card_language"]
          liga_subcategory: string | null
          name: string
          pokemon_type: string | null
          stock: number
          trainer_subcategory: string | null
          updated_at: string
        }
        Insert: {
          base_price_cents?: number | null
          card_number: string
          category?: Database["public"]["Enums"]["card_category"]
          collection: string
          condition?: Database["public"]["Enums"]["card_condition"]
          created_at?: string
          created_by?: string | null
          event_reserved?: number
          finish: Database["public"]["Enums"]["card_finish"]
          id?: string
          illustrator_id?: string | null
          image?: string
          language: Database["public"]["Enums"]["card_language"]
          liga_subcategory?: string | null
          name: string
          pokemon_type?: string | null
          stock?: number
          trainer_subcategory?: string | null
          updated_at?: string
        }
        Update: {
          base_price_cents?: number | null
          card_number?: string
          category?: Database["public"]["Enums"]["card_category"]
          collection?: string
          condition?: Database["public"]["Enums"]["card_condition"]
          created_at?: string
          created_by?: string | null
          event_reserved?: number
          finish?: Database["public"]["Enums"]["card_finish"]
          id?: string
          illustrator_id?: string | null
          image?: string
          language?: Database["public"]["Enums"]["card_language"]
          liga_subcategory?: string | null
          name?: string
          pokemon_type?: string | null
          stock?: number
          trainer_subcategory?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cards_illustrator_id_fkey"
            columns: ["illustrator_id"]
            isOneToOne: false
            referencedRelation: "illustrators"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          active: boolean
          amount_cents: number | null
          balance_cents: number | null
          code: string
          created_at: string
          expires_at: string | null
          id: string
          max_discount_cents: number | null
          max_uses: number
          notes: string | null
          percent: number | null
          updated_at: string
          used_count: number
          user_id: string | null
        }
        Insert: {
          active?: boolean
          amount_cents?: number | null
          balance_cents?: number | null
          code: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_discount_cents?: number | null
          max_uses?: number
          notes?: string | null
          percent?: number | null
          updated_at?: string
          used_count?: number
          user_id?: string | null
        }
        Update: {
          active?: boolean
          amount_cents?: number | null
          balance_cents?: number | null
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          max_discount_cents?: number | null
          max_uses?: number
          notes?: string | null
          percent?: number | null
          updated_at?: string
          used_count?: number
          user_id?: string | null
        }
        Relationships: []
      }
      deck_cards: {
        Row: {
          card_id: string
          category: string | null
          created_at: string
          deck_id: string
          id: string
          quantity: number
        }
        Insert: {
          card_id: string
          category?: string | null
          created_at?: string
          deck_id: string
          id?: string
          quantity?: number
        }
        Update: {
          card_id?: string
          category?: string | null
          created_at?: string
          deck_id?: string
          id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "deck_cards_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deck_cards_deck_id_fkey"
            columns: ["deck_id"]
            isOneToOne: false
            referencedRelation: "decks"
            referencedColumns: ["id"]
          },
        ]
      }
      decks: {
        Row: {
          created_at: string
          description: string | null
          format: string | null
          id: string
          is_public: boolean
          name: string
          share_token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          format?: string | null
          id?: string
          is_public?: boolean
          name: string
          share_token?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          format?: string | null
          id?: string
          is_public?: boolean
          name?: string
          share_token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          batch_id: string | null
          body_html: string | null
          created_at: string
          error_message: string | null
          from_email: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          subject: string | null
          template_name: string
        }
        Insert: {
          batch_id?: string | null
          body_html?: string | null
          created_at?: string
          error_message?: string | null
          from_email?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          subject?: string | null
          template_name: string
        }
        Update: {
          batch_id?: string | null
          body_html?: string | null
          created_at?: string
          error_message?: string | null
          from_email?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          subject?: string | null
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      flash_offers: {
        Row: {
          active: boolean
          card_id: string
          created_at: string
          created_by: string | null
          discount_percent: number
          ends_at: string
          id: string
          max_uses: number | null
          starts_at: string
          updated_at: string
          uses_count: number
        }
        Insert: {
          active?: boolean
          card_id: string
          created_at?: string
          created_by?: string | null
          discount_percent: number
          ends_at: string
          id?: string
          max_uses?: number | null
          starts_at?: string
          updated_at?: string
          uses_count?: number
        }
        Update: {
          active?: boolean
          card_id?: string
          created_at?: string
          created_by?: string | null
          discount_percent?: number
          ends_at?: string
          id?: string
          max_uses?: number | null
          starts_at?: string
          updated_at?: string
          uses_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "flash_offers_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      illustrators: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      loyalty_points_ledger: {
        Row: {
          created_at: string
          delta: number
          description: string | null
          id: string
          metadata: Json
          order_id: string | null
          reason: string
          user_id: string
          year_bucket: number | null
        }
        Insert: {
          created_at?: string
          delta: number
          description?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          reason: string
          user_id: string
          year_bucket?: number | null
        }
        Update: {
          created_at?: string
          delta?: number
          description?: string | null
          id?: string
          metadata?: Json
          order_id?: string | null
          reason?: string
          user_id?: string
          year_bucket?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_points_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      melhorenvio_tokens: {
        Row: {
          access_token: string
          created_at: string
          environment: string
          expires_at: string
          id: number
          refresh_token: string
          scope: string | null
          updated_at: string
          user_email: string | null
        }
        Insert: {
          access_token: string
          created_at?: string
          environment?: string
          expires_at: string
          id?: number
          refresh_token: string
          scope?: string | null
          updated_at?: string
          user_email?: string | null
        }
        Update: {
          access_token?: string
          created_at?: string
          environment?: string
          expires_at?: string
          id?: number
          refresh_token?: string
          scope?: string | null
          updated_at?: string
          user_email?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          cancelled_at: string | null
          cancelled_quantity: number
          card_id: string
          card_image: string | null
          card_name: string
          card_number: string | null
          collection: string | null
          condition: string | null
          created_at: string
          finish: string | null
          id: string
          language: string | null
          liga_subcategory: string | null
          order_id: string
          picked_at: string | null
          picked_by: string | null
          quantity: number
          refund_cents: number
          refund_coupon_code: string | null
          refund_method: string | null
          refund_notes: string | null
          unit_price_cents: number
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_quantity?: number
          card_id: string
          card_image?: string | null
          card_name: string
          card_number?: string | null
          collection?: string | null
          condition?: string | null
          created_at?: string
          finish?: string | null
          id?: string
          language?: string | null
          liga_subcategory?: string | null
          order_id: string
          picked_at?: string | null
          picked_by?: string | null
          quantity: number
          refund_cents?: number
          refund_coupon_code?: string | null
          refund_method?: string | null
          refund_notes?: string | null
          unit_price_cents: number
        }
        Update: {
          cancelled_at?: string | null
          cancelled_quantity?: number
          card_id?: string
          card_image?: string | null
          card_name?: string
          card_number?: string | null
          collection?: string | null
          condition?: string | null
          created_at?: string
          finish?: string | null
          id?: string
          language?: string | null
          liga_subcategory?: string | null
          order_id?: string
          picked_at?: string | null
          picked_by?: string | null
          quantity?: number
          refund_cents?: number
          refund_coupon_code?: string | null
          refund_method?: string | null
          refund_notes?: string | null
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          arte_em_cards_code: string | null
          bundle_discount_cents: number
          carrier: string | null
          cep: string
          city: string
          complement: string | null
          coupon_code: string | null
          coupon_discount_cents: number
          cpf: string | null
          created_at: string
          discount_cents: number
          email: string
          id: string
          mercadopago_payment_id: string | null
          neighborhood: string
          notes: string | null
          number: string
          payment_method: string
          phone: string | null
          pix_discount_cents: number
          pix_expires_at: string | null
          pix_qr_code: string | null
          pix_qr_code_base64: string | null
          points_discount_cents: number
          points_earned: number
          points_redeemed: number
          pre_cancel_status: string | null
          recipient_name: string
          refunded_cents: number
          shipping_cost_cents: number
          shipping_method: string
          state: string
          status: string
          stock_decremented: boolean
          stock_reservation_expires_at: string | null
          street: string
          stripe_payment_intent: string | null
          stripe_session_id: string | null
          subtotal_cents: number
          superfrete_error: string | null
          superfrete_label_url: string | null
          superfrete_order_id: string | null
          superfrete_service_id: string | null
          superfrete_service_name: string | null
          superfrete_status: string | null
          total_cents: number
          tracking_code: string | null
          tracking_url: string | null
          updated_at: string
          user_id: string
          wallet_deduction_cents: number
        }
        Insert: {
          arte_em_cards_code?: string | null
          bundle_discount_cents?: number
          carrier?: string | null
          cep: string
          city: string
          complement?: string | null
          coupon_code?: string | null
          coupon_discount_cents?: number
          cpf?: string | null
          created_at?: string
          discount_cents?: number
          email: string
          id?: string
          mercadopago_payment_id?: string | null
          neighborhood: string
          notes?: string | null
          number: string
          payment_method?: string
          phone?: string | null
          pix_discount_cents?: number
          pix_expires_at?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          points_discount_cents?: number
          points_earned?: number
          points_redeemed?: number
          pre_cancel_status?: string | null
          recipient_name: string
          refunded_cents?: number
          shipping_cost_cents?: number
          shipping_method: string
          state: string
          status?: string
          stock_decremented?: boolean
          stock_reservation_expires_at?: string | null
          street: string
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          subtotal_cents: number
          superfrete_error?: string | null
          superfrete_label_url?: string | null
          superfrete_order_id?: string | null
          superfrete_service_id?: string | null
          superfrete_service_name?: string | null
          superfrete_status?: string | null
          total_cents: number
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_id: string
          wallet_deduction_cents?: number
        }
        Update: {
          arte_em_cards_code?: string | null
          bundle_discount_cents?: number
          carrier?: string | null
          cep?: string
          city?: string
          complement?: string | null
          coupon_code?: string | null
          coupon_discount_cents?: number
          cpf?: string | null
          created_at?: string
          discount_cents?: number
          email?: string
          id?: string
          mercadopago_payment_id?: string | null
          neighborhood?: string
          notes?: string | null
          number?: string
          payment_method?: string
          phone?: string | null
          pix_discount_cents?: number
          pix_expires_at?: string | null
          pix_qr_code?: string | null
          pix_qr_code_base64?: string | null
          points_discount_cents?: number
          points_earned?: number
          points_redeemed?: number
          pre_cancel_status?: string | null
          recipient_name?: string
          refunded_cents?: number
          shipping_cost_cents?: number
          shipping_method?: string
          state?: string
          status?: string
          stock_decremented?: boolean
          stock_reservation_expires_at?: string | null
          street?: string
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          subtotal_cents?: number
          superfrete_error?: string | null
          superfrete_label_url?: string | null
          superfrete_order_id?: string | null
          superfrete_service_id?: string | null
          superfrete_service_name?: string | null
          superfrete_status?: string | null
          total_cents?: number
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_id?: string
          wallet_deduction_cents?: number
        }
        Relationships: []
      }
      panels: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          images: string[]
          price_cents: number
          sort_order: number
          stock: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          price_cents?: number
          sort_order?: number
          stock?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          price_cents?: number
          sort_order?: number
          stock?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      post_purchase_surveys: {
        Row: {
          comment: string | null
          created_at: string
          how_found_us: string | null
          id: string
          order_id: string
          satisfaction: number | null
          skipped: boolean
          user_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          how_found_us?: string | null
          id?: string
          order_id: string
          satisfaction?: number | null
          skipped?: boolean
          user_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          how_found_us?: string | null
          id?: string
          order_id?: string
          satisfaction?: number | null
          skipped?: boolean
          user_id?: string
        }
        Relationships: []
      }
      presale_pages: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          is_active: boolean
          slug: string
          sort_order: number
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          slug: string
          sort_order?: number
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          slug?: string
          sort_order?: number
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      presale_products: {
        Row: {
          available_from: string | null
          created_at: string
          description: string
          id: string
          image_url: string | null
          image_urls: string[]
          language: string | null
          name: string
          page_id: string
          payment_options: Json
          price_cents: number
          quantity: number
          release_year: number | null
          sort_order: number
          updated_at: string
          whatsapp_button_text: string
          whatsapp_message_template: string
        }
        Insert: {
          available_from?: string | null
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          image_urls?: string[]
          language?: string | null
          name: string
          page_id: string
          payment_options?: Json
          price_cents?: number
          quantity?: number
          release_year?: number | null
          sort_order?: number
          updated_at?: string
          whatsapp_button_text?: string
          whatsapp_message_template?: string
        }
        Update: {
          available_from?: string | null
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          image_urls?: string[]
          language?: string | null
          name?: string
          page_id?: string
          payment_options?: Json
          price_cents?: number
          quantity?: number
          release_year?: number | null
          sort_order?: number
          updated_at?: string
          whatsapp_button_text?: string
          whatsapp_message_template?: string
        }
        Relationships: [
          {
            foreignKeyName: "presale_products_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "presale_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      price_update_runs: {
        Row: {
          error_count: number
          finished_at: string | null
          id: string
          notes: string | null
          started_at: string
          status: string
          total_variants: number
          trigger: string
          updated_count: number
        }
        Insert: {
          error_count?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          status?: string
          total_variants?: number
          trigger?: string
          updated_count?: number
        }
        Update: {
          error_count?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          started_at?: string
          status?: string
          total_variants?: number
          trigger?: string
          updated_count?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          birth_date: string | null
          cpf: string | null
          created_at: string
          favorite_categories: string[]
          favorite_pokemons: string[]
          full_name: string | null
          id: string
          mp_customer_id: string | null
          phone: string | null
          updated_at: string
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          favorite_categories?: string[]
          favorite_pokemons?: string[]
          full_name?: string | null
          id?: string
          mp_customer_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          birth_date?: string | null
          cpf?: string | null
          created_at?: string
          favorite_categories?: string[]
          favorite_pokemons?: string[]
          full_name?: string | null
          id?: string
          mp_customer_id?: string | null
          phone?: string | null
          updated_at?: string
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      raffle_admin_logs: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json
          id: string
          raffle_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          raffle_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json
          id?: string
          raffle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "raffle_admin_logs_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id"]
          },
        ]
      }
      raffle_entries: {
        Row: {
          created_at: string
          entry_code: string
          id: string
          raffle_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_code: string
          id?: string
          raffle_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_code?: string
          id?: string
          raffle_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raffle_entries_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id"]
          },
        ]
      }
      raffle_winners: {
        Row: {
          created_at: string
          entry_id: string
          id: string
          notes: string | null
          order_id: string | null
          raffle_id: string
          reserved_until: string | null
          round: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entry_id: string
          id?: string
          notes?: string | null
          order_id?: string | null
          raffle_id: string
          reserved_until?: string | null
          round?: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          entry_id?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          raffle_id?: string
          reserved_until?: string | null
          round?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "raffle_winners_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "raffle_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raffle_winners_raffle_id_fkey"
            columns: ["raffle_id"]
            isOneToOne: false
            referencedRelation: "raffles"
            referencedColumns: ["id"]
          },
        ]
      }
      raffles: {
        Row: {
          closes_at: string
          created_at: string
          created_by: string | null
          draw_at: string | null
          entry_limit_per_user: number
          id: string
          opens_at: string
          payment_deadline_hours: number
          product_id: string | null
          product_image: string | null
          product_name: string
          product_price_cents: number
          product_type: string
          rules: string | null
          status: string
          title: string
          units: number
          updated_at: string
        }
        Insert: {
          closes_at: string
          created_at?: string
          created_by?: string | null
          draw_at?: string | null
          entry_limit_per_user?: number
          id?: string
          opens_at: string
          payment_deadline_hours?: number
          product_id?: string | null
          product_image?: string | null
          product_name: string
          product_price_cents?: number
          product_type?: string
          rules?: string | null
          status?: string
          title: string
          units?: number
          updated_at?: string
        }
        Update: {
          closes_at?: string
          created_at?: string
          created_by?: string | null
          draw_at?: string | null
          entry_limit_per_user?: number
          id?: string
          opens_at?: string
          payment_deadline_hours?: number
          product_id?: string | null
          product_image?: string | null
          product_name?: string
          product_price_cents?: number
          product_type?: string
          rules?: string | null
          status?: string
          title?: string
          units?: number
          updated_at?: string
        }
        Relationships: []
      }
      saved_cards: {
        Row: {
          brand: string | null
          cardholder_name: string | null
          created_at: string
          exp_month: number | null
          exp_year: number | null
          id: string
          last_four: string
          mp_card_id: string
          mp_customer_id: string
          payment_method_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          cardholder_name?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          last_four: string
          mp_card_id: string
          mp_customer_id: string
          payment_method_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          brand?: string | null
          cardholder_name?: string | null
          created_at?: string
          exp_month?: number | null
          exp_year?: number | null
          id?: string
          last_four?: string
          mp_card_id?: string
          mp_customer_id?: string
          payment_method_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sealed_products: {
        Row: {
          active: boolean
          age_rating: string | null
          collection: string | null
          condition: string | null
          created_at: string
          description: string | null
          distribution: string | null
          id: string
          images: string[]
          is_preorder: boolean
          language: string | null
          price_cents: number
          product_type: string | null
          release_date: string | null
          sku: string | null
          sort_order: number
          stock: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          age_rating?: string | null
          collection?: string | null
          condition?: string | null
          created_at?: string
          description?: string | null
          distribution?: string | null
          id?: string
          images?: string[]
          is_preorder?: boolean
          language?: string | null
          price_cents?: number
          product_type?: string | null
          release_date?: string | null
          sku?: string | null
          sort_order?: number
          stock?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          age_rating?: string | null
          collection?: string | null
          condition?: string | null
          created_at?: string
          description?: string | null
          distribution?: string | null
          id?: string
          images?: string[]
          is_preorder?: boolean
          language?: string | null
          price_cents?: number
          product_type?: string | null
          release_date?: string | null
          sku?: string | null
          sort_order?: number
          stock?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      service_orders: {
        Row: {
          amount_cents: number
          arte_em_cards_code: string | null
          carrier: string | null
          cep: string | null
          city: string | null
          code: number
          complement: string | null
          created_at: string
          id: string
          method: string
          neighborhood: string | null
          notes: string | null
          number: string | null
          payment_order_id: string | null
          phone: string | null
          recipient_name: string | null
          shipping_cost_cents: number
          stack_id: string
          state: string | null
          status: string
          street: string | null
          tracking_code: string | null
          tracking_url: string | null
          updated_at: string
          user_id: string
          whatsapp_sent_at: string | null
        }
        Insert: {
          amount_cents?: number
          arte_em_cards_code?: string | null
          carrier?: string | null
          cep?: string | null
          city?: string | null
          code?: number
          complement?: string | null
          created_at?: string
          id?: string
          method: string
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          payment_order_id?: string | null
          phone?: string | null
          recipient_name?: string | null
          shipping_cost_cents?: number
          stack_id: string
          state?: string | null
          status?: string
          street?: string | null
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_id: string
          whatsapp_sent_at?: string | null
        }
        Update: {
          amount_cents?: number
          arte_em_cards_code?: string | null
          carrier?: string | null
          cep?: string | null
          city?: string | null
          code?: number
          complement?: string | null
          created_at?: string
          id?: string
          method?: string
          neighborhood?: string | null
          notes?: string | null
          number?: string | null
          payment_order_id?: string | null
          phone?: string | null
          recipient_name?: string | null
          shipping_cost_cents?: number
          stack_id?: string
          state?: string | null
          status?: string
          street?: string | null
          tracking_code?: string | null
          tracking_url?: string | null
          updated_at?: string
          user_id?: string
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "service_orders_stack_id_fkey"
            columns: ["stack_id"]
            isOneToOne: false
            referencedRelation: "card_stacks"
            referencedColumns: ["id"]
          },
        ]
      }
      site_popups: {
        Row: {
          active: boolean
          body_html: string
          button_action: string
          button_bg_color: string | null
          button_enabled: boolean
          button_label: string | null
          button_target: string | null
          button_text_color: string | null
          created_at: string
          ends_at: string | null
          icon_bg_color: string | null
          icon_color: string | null
          icon_key: string
          id: string
          image_url: string | null
          is_promo_code: boolean
          link_url: string | null
          promo_bg_color: string | null
          promo_code: string | null
          promo_text_color: string | null
          show_on_notices: boolean
          sort_order: number
          starts_at: string | null
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body_html?: string
          button_action?: string
          button_bg_color?: string | null
          button_enabled?: boolean
          button_label?: string | null
          button_target?: string | null
          button_text_color?: string | null
          created_at?: string
          ends_at?: string | null
          icon_bg_color?: string | null
          icon_color?: string | null
          icon_key?: string
          id?: string
          image_url?: string | null
          is_promo_code?: boolean
          link_url?: string | null
          promo_bg_color?: string | null
          promo_code?: string | null
          promo_text_color?: string | null
          show_on_notices?: boolean
          sort_order?: number
          starts_at?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body_html?: string
          button_action?: string
          button_bg_color?: string | null
          button_enabled?: boolean
          button_label?: string | null
          button_target?: string | null
          button_text_color?: string | null
          created_at?: string
          ends_at?: string | null
          icon_bg_color?: string | null
          icon_color?: string | null
          icon_key?: string
          id?: string
          image_url?: string | null
          is_promo_code?: boolean
          link_url?: string | null
          promo_bg_color?: string | null
          promo_code?: string | null
          promo_text_color?: string | null
          show_on_notices?: boolean
          sort_order?: number
          starts_at?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      stock_alerts: {
        Row: {
          card_collection: string
          card_key: string
          card_name: string
          card_number: string
          created_at: string
          email: string
          id: string
          notified_at: string | null
          user_id: string
        }
        Insert: {
          card_collection: string
          card_key: string
          card_name: string
          card_number: string
          created_at?: string
          email: string
          id?: string
          notified_at?: string | null
          user_id: string
        }
        Update: {
          card_collection?: string
          card_key?: string
          card_name?: string
          card_number?: string
          created_at?: string
          email?: string
          id?: string
          notified_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      stock_reservations: {
        Row: {
          card_id: string
          created_at: string
          expires_at: string
          id: string
          order_id: string | null
          quantity: number
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          expires_at: string
          id?: string
          order_id?: string | null
          quantity: number
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          order_id?: string | null
          quantity?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_reservations_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_reservations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
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
      videogames: {
        Row: {
          active: boolean
          condition: string
          created_at: string
          description: string | null
          id: string
          images: string[]
          includes_box: boolean
          platform: string
          price_cents: number
          region: string | null
          sort_order: number
          stock: number
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          condition?: string
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          includes_box?: boolean
          platform?: string
          price_cents?: number
          region?: string | null
          sort_order?: number
          stock?: number
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          condition?: string
          created_at?: string
          description?: string | null
          id?: string
          images?: string[]
          includes_box?: boolean
          platform?: string
          price_cents?: number
          region?: string | null
          sort_order?: number
          stock?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      wishlist: {
        Row: {
          card_key: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          card_key: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          card_key?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      wishlist_share_tokens: {
        Row: {
          created_at: string
          id: string
          revoked_at: string | null
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          revoked_at?: string | null
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          revoked_at?: string | null
          token?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_event_stock_sales: {
        Args: { _items: Json; _reason?: string }
        Returns: number
      }
      available_stock: { Args: { _card_id: string }; Returns: number }
      award_birthday_points_today: { Args: never; Returns: number }
      backfill_loyalty_points_for_orders: {
        Args: never
        Returns: {
          orders_processed: number
          points_credited: number
        }[]
      }
      clear_event_reserved: { Args: never; Returns: number }
      expire_old_loyalty_points: { Args: never; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_user_purchased: { Args: { _user_id: string }; Returns: boolean }
      increment_card_view: { Args: { _card_key: string }; Returns: undefined }
      raffle_expire_reservations: { Args: never; Returns: number }
      raffle_join: {
        Args: { _raffle_id: string }
        Returns: {
          entry_code: string
          entry_id: string
        }[]
      }
      raffle_run_draw: {
        Args: { _raffle_id: string; _units?: number }
        Returns: number
      }
      set_event_reserved: { Args: { _items: Json }; Returns: number }
      user_lifetime_earned: { Args: { _user_id: string }; Returns: number }
      user_points_balance: { Args: { _user_id: string }; Returns: number }
      user_tier: { Args: { _user_id: string }; Returns: string }
      user_tier_multiplier_bp: { Args: { _user_id: string }; Returns: number }
    }
    Enums: {
      app_role: "admin" | "user"
      card_category: "Pokémon" | "Treinador" | "Energia"
      card_condition: "M" | "NM" | "SP" | "MP" | "HP" | "D"
      card_finish:
        | "Normal"
        | "Foil"
        | "Reverse Foil"
        | "Pokebola"
        | "Energia"
        | "Promo"
        | "Ímã"
        | "Shattered Holo"
        | "Illustration Rare"
        | "Ultra Rara"
        | "Black Star Promo"
        | "Double Rare"
        | "Masterball"
        | "Rocket"
        | "Liga"
      card_language:
        | "Português"
        | "Inglês"
        | "Italiano"
        | "Espanhol"
        | "Japonês"
        | "Chinês"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
      card_category: ["Pokémon", "Treinador", "Energia"],
      card_condition: ["M", "NM", "SP", "MP", "HP", "D"],
      card_finish: [
        "Normal",
        "Foil",
        "Reverse Foil",
        "Pokebola",
        "Energia",
        "Promo",
        "Ímã",
        "Shattered Holo",
        "Illustration Rare",
        "Ultra Rara",
        "Black Star Promo",
        "Double Rare",
        "Masterball",
        "Rocket",
        "Liga",
      ],
      card_language: [
        "Português",
        "Inglês",
        "Italiano",
        "Espanhol",
        "Japonês",
        "Chinês",
      ],
    },
  },
} as const
