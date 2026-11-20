export interface SocialLink {
  key: string;
  label: string;
  /** The handle, username or URL shown as the profile's detail. */
  value: string;
  /** Raw handle for the stats API when it differs from what is displayed. */
  apiHandle?: string;
  href: string;
  icon: React.ReactNode;
}
