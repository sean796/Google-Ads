export interface Post {
  id: number;
  slug: string;
  title: string;
  date_gmt: string;
  status: string;
  link: string;
}

export interface PostCalendarProps {
  posts: Post[];
  sitemapUrl: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}
