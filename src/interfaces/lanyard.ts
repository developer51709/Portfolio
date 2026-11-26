export type DiscordStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface LanyardSpotify {
  track_id: string;
  timestamps: {
    start: number;
    end: number;
  };
  album: string;
  album_art_url: string;
  artist: string;
  song: string;
}

export interface LanyardActivityEmoji {
  name: string;
  id?: string;
  animated?: boolean;
}

export interface LanyardActivity {
  application_id?: string;
  assets?: {
    large_image?: string;
    large_text?: string;
    small_image?: string;
    small_text?: string;
  };
  created_at?: number;
  details?: string;
  emoji?: LanyardActivityEmoji; // present on custom status (type 4)
  flags?: number;
  id: string;
  name: string;
  state?: string;
  timestamps?: {
    start?: number;
    end?: number;
  };
  /**
   * Activity types:
   * 0 = Playing, 1 = Streaming, 2 = Listening, 3 = Watching, 4 = Custom, 5 = Competing
   */
  type: number;
  url?: string;
}

export interface LanyardClan {
  /** The clan's short tag (e.g. "REP") */
  tag: string;
  /** Badge image hash — use with identity_guild_id to build the CDN URL */
  badge: string;
  identity_guild_id: string;
  identity_enabled: boolean;
}

export interface LanyardAvatarDecoration {
  /** Decoration preset asset hash */
  asset: string;
  sku_id: string;
}

export interface LanyardDiscordUser {
  avatar: string;
  /** Hex color string (e.g. "#5865F2"), present when the user has a Nitro banner color */
  banner_color?: string | null;
  discriminator: string;
  display_name: string;
  global_name: string;
  id: string;
  public_flags: number;
  username: string;
  /** Avatar decoration data, present when user has an active decoration */
  avatar_decoration_data?: LanyardAvatarDecoration | null;
  /** Nitro name styling: two 24-bit colours, a font and an effect. */
  display_name_styles?: {
    colors?: number[];
    font_id?: number;
    effect_id?: number;
  } | null;
  /** Clan / guild tag data */
  primary_guild?: LanyardClan | null;
}

export interface LanyardData {
  active_on_discord_desktop: boolean;
  active_on_discord_embedded: boolean;
  active_on_discord_mobile: boolean;
  active_on_discord_vr: boolean;
  active_on_discord_web: boolean;
  activities: LanyardActivity[];
  discord_status: DiscordStatus;
  discord_user: LanyardDiscordUser;
  kv: Record<string, string>;
  listening_to_spotify: boolean;
  spotify: LanyardSpotify | null;
}
