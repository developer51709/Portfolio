export interface GithubProject {
  name: string;
  html_url: string;
  description: string;
  stargazers_count: string;
  forks_count: string;
  language: string;
  /** Returned by the repository search API; absent on older cached payloads. */
  topics?: string[];
  homepage?: string | null;
  updated_at?: string;
}
