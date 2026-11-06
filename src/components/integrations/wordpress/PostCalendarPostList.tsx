import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge, ScrollArea } from "@/ui";
import type { Post } from "@/components/integrations/wordpress/post-calendar-types";

export function PostCalendarPostList({
  selectedDate,
  selectedDatePosts,
  allPostsSorted,
  posts,
}: {
  selectedDate: Date | undefined;
  selectedDatePosts: Post[];
  allPostsSorted: Post[];
  posts: Post[];
}) {
  return (
            <ScrollArea className="h-[300px]">
              {selectedDate ? (
                // Show posts for selected date
                selectedDatePosts.length > 0 ? (
                  <div className="space-y-2">
                    {selectedDatePosts.map((post) => {
                      const postDate = post.date_gmt ? new Date(post.date_gmt) : null;
                      const isFutureStatus = post.status === 'future';
                      const isFutureDate = postDate ? postDate > new Date() : false;
                      const isFuture = isFutureStatus || isFutureDate;
                      
                      return (
                        <div
                          key={post.id}
                          className={cn(
                            "p-3 border rounded-md hover:bg-accent/50 transition-colors",
                            isFuture 
                              ? "border-semantic-publish/30 bg-semantic-publish/5" 
                              : "border-border"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium break-words" title={post.title}>
                                {post.title}
                              </h4>
                              <div className="flex items-center gap-2 mt-1 text-xs">
                                {isFuture ? (
                                  <>
                                    <Clock className="h-3 w-3 text-semantic-publish-foreground" />
                                    <span className="text-semantic-publish-foreground font-medium">
                                      {postDate 
                                        ? `Scheduled: ${format(postDate, 'MMM d, yyyy h:mm a')}`
                                        : 'Scheduled (Future)'
                                      }
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <Clock className="h-3 w-3 text-primary" />
                                    <span className="text-primary font-medium">
                                      {postDate 
                                        ? `Published: ${format(postDate, 'MMM d, yyyy h:mm a')}`
                                        : 'Published'
                                      }
                                    </span>
                                  </>
                                )}
                                {isFutureStatus && (
                                  <Badge variant="outline" className="text-xs bg-semantic-publish/20 text-semantic-publish-foreground border-semantic-publish/30">
                                    Future
                                  </Badge>
                                )}
                                {isFuture && !isFutureStatus && (
                                  <Badge variant="outline" className="text-xs bg-semantic-publish/20 text-semantic-publish-foreground border-semantic-publish/30">
                                    Scheduled
                                  </Badge>
                                )}
                                {post.status === 'publish' && !isFuture && (
                                  <Badge variant="outline" className="text-xs bg-primary/20 text-primary border-primary/30">
                                    Published
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <a
                              href={post.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-xs shrink-0"
                            >
                              View
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    No posts scheduled for this date
                  </div>
                )
              ) : (
                // Show all posts when no date is selected
                allPostsSorted.length > 0 ? (
                  <div className="space-y-2">
                    {allPostsSorted.map((post) => {
                      const postDate = post.date_gmt ? new Date(post.date_gmt) : null;
                      const isFutureStatus = post.status === 'future';
                      const isFutureDate = postDate ? postDate > new Date() : false;
                      const isFuture = isFutureStatus || isFutureDate;
                      const isPublished = post.status === 'publish' && !isFuture;
                      
                      return (
                        <div
                          key={post.id}
                          className={cn(
                            "p-3 border rounded-md hover:bg-accent/50 transition-colors",
                            isFuture 
                              ? "border-semantic-publish/30 bg-semantic-publish/5" 
                              : isPublished
                                ? "border-primary/30 bg-primary/5"
                                : "border-border"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium break-words" title={post.title}>
                                {post.title}
                              </h4>
                              <div className="flex items-center gap-2 mt-1 text-xs">
                                {isFuture ? (
                                  <>
                                    <Clock className="h-3 w-3 text-semantic-publish-foreground" />
                                    <span className="text-semantic-publish-foreground font-medium">
                                      {postDate 
                                        ? `Scheduled: ${format(postDate, 'MMM d, yyyy h:mm a')}`
                                        : 'Scheduled (Future)'
                                      }
                                    </span>
                                  </>
                                ) : isPublished ? (
                                  <>
                                    <Clock className="h-3 w-3 text-primary" />
                                    <span className="text-primary font-medium">
                                      {postDate 
                                        ? `Published: ${format(postDate, 'MMM d, yyyy h:mm a')}`
                                        : 'Published'
                                      }
                                    </span>
                                  </>
                                ) : (
                                  <>
                                    <span className="text-muted-foreground">
                                      {postDate 
                                        ? format(postDate, 'MMM d, yyyy h:mm a')
                                        : 'No date'
                                      }
                                    </span>
                                  </>
                                )}
                                {isFutureStatus && (
                                  <Badge variant="outline" className="text-xs bg-semantic-publish/20 text-semantic-publish-foreground border-semantic-publish/30">
                                    Future
                                  </Badge>
                                )}
                                {isFuture && !isFutureStatus && (
                                  <Badge variant="outline" className="text-xs bg-semantic-publish/20 text-semantic-publish-foreground border-semantic-publish/30">
                                    Scheduled
                                  </Badge>
                                )}
                                {isPublished && (
                                  <Badge variant="outline" className="text-xs bg-primary/20 text-primary border-primary/30">
                                    Published
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <a
                              href={post.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline text-xs shrink-0"
                            >
                              View
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No posts available</p>
                  </div>
                )
              )}
            </ScrollArea>
  );
}
