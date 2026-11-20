export interface SocialProfileStat {
  label: string;
  value: number;
  /** Pre-formatted label for counts the source abbreviates ("21.4M"). */
  display?: string;
}

export interface SocialProfile {
  platform: string;
  displayName: string;
  handle: string;
  avatar: string | null;
  bio: string;
  profileUrl: string | null;
  stats: SocialProfileStat[];
}
