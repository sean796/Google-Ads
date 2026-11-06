import { Sparkles } from "lucide-react";

export function OverviewSitemapLeftDockPlaceholder({ slotNum }: { slotNum: number }) {
  return (
                      <div className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border/60 bg-ui-field/40 p-2.5 transition-all group-hover:border-primary/50 group-hover:bg-ui-field/80">
                        {/* Blueprint Article Graphic */}
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border/60 bg-gradient-to-b from-muted-foreground to-muted-foreground shadow-inner group-hover:border-primary/40 transition-colors">
                          <svg
                            viewBox="0 0 28 28"
                            fill="none"
                            className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-primary"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <rect
                              x="2"
                              y="2"
                              width="24"
                              height="24"
                              rx="3"
                              strokeDasharray="2.5 2.5"
                              className="stroke-muted-foreground group-hover:stroke-primary/50"
                            />
                            <rect
                              x="6"
                              y="6"
                              width="6"
                              height="6"
                              rx="1.5"
                              className="fill-muted-foreground/50 stroke-muted-foreground group-hover:fill-primary/20 group-hover:stroke-primary/60"
                            />
                            <line
                              x1="15"
                              y1="7"
                              x2="22"
                              y2="7"
                              strokeLinecap="round"
                              className="stroke-muted-foreground group-hover:stroke-primary/70"
                            />
                            <line
                              x1="15"
                              y1="10.5"
                              x2="20"
                              y2="10.5"
                              strokeLinecap="round"
                              className="stroke-muted-foreground"
                            />
                            <line
                              x1="6"
                              y1="16"
                              x2="22"
                              y2="16"
                              strokeLinecap="round"
                              className="stroke-muted-foreground"
                            />
                            <line
                              x1="6"
                              y1="19.5"
                              x2="17"
                              y2="19.5"
                              strokeLinecap="round"
                              className="stroke-muted-foreground"
                            />
                          </svg>
                          <span className="absolute -top-1 -right-1 flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/80 opacity-40" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-primary/80" />
                          </span>
                        </div>

                        {/* Graphic details and wireframe bars */}
                        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 rounded bg-ui-field-hover/90 px-1.5 py-0.5 text-base font-semibold uppercase tracking-wider text-foreground group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                              <Sparkles className="h-2.5 w-2.5 text-primary" />
                              Slot {slotNum}
                            </span>
                          </div>
                          <div className="flex flex-col gap-1 w-full pt-0.5">
                            <div className="h-2 w-4/5 rounded-full bg-ui-field-hover group-hover:bg-ui-field-hover/60 transition-colors" />
                            <div className="h-1.5 w-1/2 rounded-full bg-ui-field-hover/60 group-hover:bg-ui-field-hover/40 transition-colors" />
                          </div>
                        </div>
                      </div>
  );
}
