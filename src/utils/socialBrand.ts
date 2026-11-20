/**
 * Brand colours for the social logos. The icons are monochrome glyphs from
 * react-icons, so the "coloured version" is the same glyph tinted with the
 * platform's brand hue; brands whose colour is black get a light tint so they
 * stay visible on the dark UI.
 */
const BRAND_COLORS: Record<string, string> = {
  x: '#ffffff',
  mastodon: '#6364ff',
  researchgate: '#00ccbb',
  linkedin: '#0a66c2',
  dribbble: '#ea4c89',
  behance: '#1769ff',
  facebook: '#1877f2',
  instagram: '#e4405f',
  reddit: '#ff4500',
  threads: '#ffffff',
  youtube: '#ff0000',
  udemy: '#a435f0',
  medium: '#ffffff',
  dev: '#ffffff',
  stackoverflow: '#f48024',
  website: '#7dd3fc',
  telegram: '#26a5e4',
  tiktok: '#fe2c55',
  twitch: '#9146ff',
  snapchat: '#fffc00',
  pinterest: '#e60023',
  bluesky: '#1185fe',
  spotify: '#1db954',
  github: '#ffffff',
  discord: '#5865f2',
  email: '#ea4335',
  phone: '#34a853',
};

/** The platform's brand hue, or `undefined` for keys we have no colour for. */
export const socialBrandColor = (key: string): string | undefined =>
  BRAND_COLORS[key];
