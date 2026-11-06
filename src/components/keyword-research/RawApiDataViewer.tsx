


import {
  Search,
  TrendingUp,
  Target,
  BarChart3,
  Sparkles,
  ChevronDown,
  AlertCircle,
} from "lucide-react";
import { parseRawApiData } from "@/lib/keyword-api-parser";
import { Button, Card, Badge, Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui";

interface RawApiDataViewerProps {
  rawApiData: unknown;
}

export function RawApiDataViewer({ rawApiData }: RawApiDataViewerProps) {
  const raw =
    rawApiData && typeof rawApiData === "object"
      ? (rawApiData as { tasks?: unknown; keywordOverview?: unknown; serpData?: unknown })
      : null;
  if (!raw || (!raw.tasks && !raw.keywordOverview)) {
    return null;
  }

  const results = parseRawApiData(rawApiData);
  const apiData = raw.keywordOverview || rawApiData;

  // If no results extracted, show raw data for debugging
  if (results.length === 0) {
    return (
      <Card className="p-6 border-semantic-warning/50 bg-semantic-warning/10">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-semantic-warning" />
            <h3 className="text-lg font-semibold text-foreground">Data Received But Could Not Parse</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            The API returned data, but it couldn't be parsed into the expected format. Check the console for details.
          </p>
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button>
                <ChevronDown className="w-4 h-4 mr-2" />
                Show Raw Data Structure
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <pre className="text-xs overflow-auto" style={{ maxHeight: '400px', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(apiData, null, 2)}
                </pre>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4 mb-4">
      {results.map(({ keyword, info }, idx) => (
        <Card key={idx} className="p-6 border-border/50 bg-card shadow-sm">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Search className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-foreground">{keyword}</h3>
                  {info.last_updated_time && (
                    <p className="text-sm text-muted-foreground">
                      Last updated: {info.last_updated_time}
                    </p>
                  )}
                </div>
              </div>
              <Badge 
                variant={info.competition_level === 'HIGH' ? 'destructive' : info.competition_level === 'MEDIUM' ? 'secondary' : 'default'}
                className="text-sm"
              >
                {info.competition_level || 'LOW'}
              </Badge>
            </div>

            {/* Key Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Search Volume</span>
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {info.search_volume?.toLocaleString() || 0}
                </div>
                <div className="text-xs text-muted-foreground mt-1">per month</div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
                <div className="flex items-center gap-2 mb-2">
                  <BarChart3 className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">CPC</span>
                </div>
                <div className="text-2xl font-bold text-foreground">
                  ${info.cpc?.toFixed(2) || '0.00'}
                </div>
                <div className="text-xs text-muted-foreground mt-1">cost per click</div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
                <div className="flex items-center gap-2 mb-2">
                  <Target className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Competition</span>
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {info.competition ? (info.competition * 100).toFixed(0) : 0}%
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {info.competition_level || 'LOW'}
                </div>
              </div>

              <div className="p-4 bg-muted/50 rounded-lg border border-border/50">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-xs font-medium text-muted-foreground">Difficulty</span>
                </div>
                <div className="text-2xl font-bold text-foreground">
                  {info.keyword_difficulty || 0}
                </div>
                <div className="text-xs text-muted-foreground mt-1">out of 100</div>
              </div>
            </div>

            {/* Bid Range */}
            {(info.low_top_of_page_bid || info.high_top_of_page_bid) && (
              <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Top of Page Bid Range</span>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      Low: ${info.low_top_of_page_bid?.toFixed(2) || '0.00'}
                    </Badge>
                    <span className="text-muted-foreground">-</span>
                    <Badge variant="outline" className="text-xs">
                      High: ${info.high_top_of_page_bid?.toFixed(2) || '0.00'}
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Monthly Searches Trend */}
            {info.monthly_searches && Array.isArray(info.monthly_searches) && info.monthly_searches.length > 0 && (
              <div className="p-4 bg-muted/30 rounded-lg border border-border/50">
                <h4 className="text-sm font-semibold mb-3 text-foreground">Monthly Search Trends</h4>
                <div className="space-y-2">
                  {info.monthly_searches.slice(-6).map((month, monthIdx: number) => (
                    <div key={monthIdx} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {month.year}-{String(month.month).padStart(2, '0')}
                      </span>
                      <span className="font-medium text-foreground">
                        {month.search_volume?.toLocaleString() || 0}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      ))}
      
      {/* Collapsible Raw Data for Debugging */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button variant="quiet">
            <ChevronDown className="w-4 h-4 mr-2" />
            Show Raw API Response (Debug)
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="p-4 mt-2 space-y-4">
            {/* Keyword Overview */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Keyword Overview Data:</h4>
              <pre className="bg-muted p-4 rounded overflow-auto text-xs" style={{ maxHeight: '400px', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(raw.keywordOverview || rawApiData, null, 2)}
              </pre>
            </div>
            {/* SERP Data */}
            {raw.serpData ? (
              <div>
                <h4 className="text-sm font-semibold mb-2">SERP Data:</h4>
                <pre className="bg-muted p-4 rounded overflow-auto text-xs" style={{ maxHeight: '400px', whiteSpace: 'pre-wrap' }}>
                  {JSON.stringify(raw.serpData, null, 2)}
                </pre>
              </div>
            ) : null}
          </Card>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

