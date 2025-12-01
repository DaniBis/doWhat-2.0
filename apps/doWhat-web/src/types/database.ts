export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

export type TraitRow = {
  id: string;
  name: string;
  color: string;
  icon: string;
  created_at: string;
  updated_at: string;
};

export type UserBaseTraitRow = {
  user_id: string;
  trait_id: string;
  created_at: string;
};

export type UserTraitVoteRow = {
  id: string;
  to_user: string;
  from_user: string;
  session_id: string;
  trait_id: string;
  created_at: string;
};

export type UserTraitSummaryRow = {
  user_id: string;
  trait_id: string;
  score: number;
  base_count: number;
  vote_count: number;
  updated_at: string;
};

export type RsvpRow = {
  id: string;
  activity_id: string | null;
  session_id: string | null;
  user_id: string;
  status: "going" | "interested" | "declined";
  created_at: string;
};

export type SessionRow = {
  id: string;
  activity_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_by: string | null;
};

export type ProfileRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

export type VenueRow = {
  id: string;
  name: string | null;
  address?: string | null;
  lat: number | null;
  lng: number | null;
  metadata?: Json | null;
  raw_description: string | null;
  raw_reviews: string[] | null;
  ai_activity_tags: string[] | null;
  ai_confidence_scores: Json | null;
  verified_activities: string[] | null;
  last_ai_update: string | null;
  needs_verification: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type VenueActivityVoteRow = {
  venue_id: string;
  user_id: string;
  activity_name: string;
  vote: boolean;
  created_at: string;
  updated_at: string;
};

export interface Database {
  public: {
    Tables: {
      traits: {
        Row: TraitRow;
        Insert: Partial<Omit<TraitRow, "name">> & Pick<TraitRow, "name">;
        Update: Partial<TraitRow>;
        Relationships: [];
      };
      user_base_traits: {
        Row: UserBaseTraitRow;
        Insert: Partial<UserBaseTraitRow> & Pick<UserBaseTraitRow, "user_id" | "trait_id">;
        Update: Partial<UserBaseTraitRow>;
        Relationships: [];
      };
      user_trait_votes: {
        Row: UserTraitVoteRow;
        Insert: Partial<UserTraitVoteRow> & Pick<UserTraitVoteRow, "to_user" | "from_user" | "session_id" | "trait_id">;
        Update: Partial<UserTraitVoteRow>;
        Relationships: [];
      };
      user_trait_summary: {
        Row: UserTraitSummaryRow;
        Insert: Partial<UserTraitSummaryRow> & Pick<UserTraitSummaryRow, "user_id" | "trait_id">;
        Update: Partial<UserTraitSummaryRow>;
        Relationships: [];
      };
      rsvps: {
        Row: RsvpRow;
        Insert: Partial<RsvpRow> & Pick<RsvpRow, "user_id">;
        Update: Partial<RsvpRow>;
        Relationships: [];
      };
      sessions: {
        Row: SessionRow;
        Insert: Partial<SessionRow>;
        Update: Partial<SessionRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & Pick<ProfileRow, "id">;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      venues: {
        Row: VenueRow;
        Insert: Partial<VenueRow> & { name?: string | null };
        Update: Partial<VenueRow>;
        Relationships: [];
      };
      venue_activity_votes: {
        Row: VenueActivityVoteRow;
        Insert: Partial<VenueActivityVoteRow> & Pick<VenueActivityVoteRow, "venue_id" | "user_id" | "activity_name" | "vote">;
        Update: Partial<VenueActivityVoteRow>;
        Relationships: [];
      };
    } & {
      [key: string]: GenericTable;
    };
    Functions: {
      increment_user_trait_score: {
        Args: {
          p_user: string;
          p_trait: string;
          p_score_delta: number;
          p_vote_delta?: number | null;
          p_base_delta?: number | null;
        };
        Returns: null;
      };
      refresh_verified_activities: {
        Args: {
          target_venue: string;
        };
        Returns: null;
      };
    } & {
      [key: string]: {
        Args: Record<string, unknown>;
        Returns: unknown;
      };
    };
    Enums: Record<string, never>;
  };
}
