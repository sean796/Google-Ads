import React, { useMemo } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, Calendar, Card, Badge } from "@/ui";
import type { DayProps } from "react-day-picker";
import type { Post, PostCalendarProps } from "@/components/integrations/wordpress/post-calendar-types";
import { PostCalendarPostList } from "@/components/integrations/wordpress/PostCalendarPostList";

export const PostCalendar: React.FC<PostCalendarProps> = ({ posts, sitemapUrl, onRefresh, isRefreshing = false }) => {
  // Reset selected date when posts change
  const [selectedDate, setSelectedDate] = React.useState<Date | undefined>(undefined);
  
  React.useEffect(() => {
    // Clear selection when posts update
    setSelectedDate(undefined);
  }, [posts.length, sitemapUrl]);

  // Group posts by date
  const postsByDate = useMemo(() => {
    const grouped: Record<string, Post[]> = {};
    
    posts.forEach(post => {
      if (!post.date_gmt) return;
      
      try {
        const postDate = new Date(post.date_gmt);
        const dateKey = format(postDate, 'yyyy-MM-dd');
        
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(post);
      } catch (error) {
        console.warn(`[PostCalendar] Invalid date for post ${post.id}: ${post.date_gmt}`);
      }
    });
    
    return grouped;
  }, [posts]);

  // Get dates with posts for calendar highlighting
  const datesWithPosts = useMemo(() => {
    return Object.keys(postsByDate).map(dateStr => {
      try {
        return new Date(dateStr);
      } catch {
        return null;
      }
    }).filter((date): date is Date => date !== null);
  }, [postsByDate]);

  // Get dates with future posts for blue highlighting
  const datesWithFuturePosts = useMemo(() => {
    const now = new Date();
    const futureDates: Date[] = [];
    
    Object.keys(postsByDate).forEach(dateStr => {
      const dayPosts = postsByDate[dateStr];
      const hasFuturePost = dayPosts.some(post => {
        // Always include posts with status 'future'
        if (post.status === 'future') return true;
        // Include posts with future dates
        if (!post.date_gmt) return false;
        try {
          const postDate = new Date(post.date_gmt);
          return postDate > now;
        } catch {
          return false;
        }
      });
      
      if (hasFuturePost) {
        try {
          futureDates.push(new Date(dateStr));
        } catch {
          // Invalid date, skip
        }
      }
    });
    
    return futureDates;
  }, [postsByDate]);

  // Get dates with published posts (non-future) for green highlighting
  const datesWithPublishedPosts = useMemo(() => {
    const now = new Date();
    const publishedDates: Date[] = [];
    
    Object.keys(postsByDate).forEach(dateStr => {
      const dayPosts = postsByDate[dateStr];
      const hasPublishedPost = dayPosts.some(post => {
        if (!post.date_gmt) return false;
        try {
          const postDate = new Date(post.date_gmt);
          return (postDate <= now && post.status === 'publish') || (post.status === 'publish' && postDate <= now);
        } catch {
          return false;
        }
      });
      
      // Only include if it doesn't have future posts (to avoid conflict)
      const hasFuturePost = dayPosts.some(post => {
        if (!post.date_gmt) return false;
        try {
          const postDate = new Date(post.date_gmt);
          return postDate > now || post.status === 'future';
        } catch {
          return false;
        }
      });
      
      if (hasPublishedPost && !hasFuturePost) {
        try {
          publishedDates.push(new Date(dateStr));
        } catch {
          // Invalid date, skip
        }
      }
    });
    
    return publishedDates;
  }, [postsByDate]);

  // Get selected date posts
  const selectedDatePosts = useMemo(() => {
    if (!selectedDate) return [];
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return postsByDate[dateKey] || [];
  }, [selectedDate, postsByDate]);

  // Get all posts sorted by date (for displaying when no date is selected)
  const allPostsSorted = useMemo(() => {
    return [...posts].sort((a, b) => {
      if (!a.date_gmt || !b.date_gmt) return 0;
      try {
        const dateA = new Date(a.date_gmt).getTime();
        const dateB = new Date(b.date_gmt).getTime();
        return dateB - dateA; // Most recent first
      } catch {
        return 0;
      }
    });
  }, [posts]);

  // Count future posts
  const futureCount = useMemo(() => {
    const now = new Date();
    return posts.filter(post => {
      // Always include posts with status 'future'
      if (post.status === 'future') return true;
      // Include posts with future dates
      if (!post.date_gmt) return false;
      try {
        const postDate = new Date(post.date_gmt);
        return postDate > now;
      } catch {
        return false;
      }
    }).length;
  }, [posts]);

  // Custom day renderer to show post counts
  const modifiers = {
    hasPosts: datesWithPosts,
    hasFuturePosts: datesWithFuturePosts,
    hasPublishedPosts: datesWithPublishedPosts,
  };

  const modifiersClassNames = {
    hasPosts: "bg-primary/10 text-primary font-semibold hover:bg-primary/20",
    hasFuturePosts: "bg-semantic-publish/20 text-semantic-publish-foreground font-semibold hover:bg-semantic-publish/30",
    hasPublishedPosts: "bg-primary/20 text-primary font-semibold hover:bg-primary/30",
  };

  // Custom day component to show post count
  const DayContent = (props: DayProps) => {
    const { date, displayMonth: _displayMonth, ...restProps } = props;
    const dayProps = restProps as React.ButtonHTMLAttributes<HTMLButtonElement>;
    const dateKey = format(date, 'yyyy-MM-dd');
    const dayPosts = postsByDate[dateKey] || [];
    const postCount = dayPosts.length;
    const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === dateKey;
    
    // Check if this date has future posts or published posts
    const now = new Date();
    const hasFuturePost = dayPosts.some(post => {
      // Always include posts with status 'future'
      if (post.status === 'future') return true;
      // Include posts with future dates
      if (!post.date_gmt) return false;
      try {
        const postDate = new Date(post.date_gmt);
        return postDate > now;
      } catch {
        return false;
      }
    });
    
    const hasPublishedPost = dayPosts.some(post => {
      if (!post.date_gmt) return false;
      try {
        const postDate = new Date(post.date_gmt);
        return (postDate <= now && post.status === 'publish') || (post.status === 'publish' && postDate <= now);
      } catch {
        return false;
      }
    }) && !hasFuturePost; // Only if no future posts

    return (
      <button
        {...dayProps}
        type="button"
        className={cn(
          "relative h-9 w-9 rounded-md text-sm font-normal transition-colors",
          dayProps.className,
          postCount > 0 && "font-semibold"
        )}
      >
        <span>{format(date, 'd')}</span>
        {postCount > 0 && (
          <span className={cn(
            "absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full flex items-center justify-center text-sm font-bold leading-none",
            isSelected
              ? hasFuturePost
                ? "bg-semantic-publish/80 text-white"
                : hasPublishedPost
                  ? "bg-primary/80 text-white"
                  : "bg-primary-foreground text-primary"
              : hasFuturePost
                ? "bg-semantic-publish/80 text-white"
                : hasPublishedPost
                  ? "bg-primary/80 text-white"
                  : "bg-primary text-primary-foreground"
          )}>
            {postCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Post Schedule</span>
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="quiet"
              onClick={(e) => {
                e.stopPropagation();
                onRefresh();
              }}
              disabled={isRefreshing}
              title="Refresh post dates from WordPress API"
            >
              {isRefreshing ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refreshing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Refresh Dates
                </>
              )}
            </Button>
          )}
          {futureCount > 0 && (
            <Badge variant="secondary" className="bg-semantic-publish/20 text-semantic-publish-foreground">
              <Clock className="h-3 w-3 mr-1" />
              {futureCount} Future
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            modifiers={modifiers}
            modifiersClassNames={modifiersClassNames}
            components={{
              Day: DayContent,
            }}
            className="rounded-md border"
          />
        </Card>

        <Card className="p-4">
          <div className="space-y-2">
            <div className="text-sm font-semibold mb-3">
              {selectedDate ? (
                <>
                  Posts on {format(selectedDate, 'MMMM d, yyyy')}
                  <Badge variant="outline" className="ml-2">
                    {selectedDatePosts.length}
                  </Badge>
                </>
              ) : (
                <>
                  All Posts
                  <Badge variant="outline" className="ml-2">
                    {posts.length}
                  </Badge>
                </>
              )}
            </div>

            <PostCalendarPostList selectedDate={selectedDate} selectedDatePosts={selectedDatePosts} allPostsSorted={allPostsSorted} posts={posts} />
          </div>
        </Card>
      </div>

      <div className="text-xs text-muted-foreground">
        <p>Total posts: {posts.length} | Future posts: {futureCount}</p>
        <p className="break-words" title={sitemapUrl}>Sitemap: {sitemapUrl}</p>
      </div>
    </div>
  );
};

