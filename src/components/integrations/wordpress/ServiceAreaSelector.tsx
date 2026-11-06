import React from "react";



import { RefreshCw, Check, ChevronsUpDown, FileText, ExternalLink, Download } from "lucide-react";
import { cn } from "@/lib/utils";
import { type WordPressSite } from "../types";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";
import { Button, Field, Popover, PopoverContent, PopoverTrigger, Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, Checkbox } from "@/ui";
import { extractEndpointFromEntitySitemapUrl } from "@/lib/entity-endpoint-extractor";
import { useServiceAreaData } from "./use-service-area-data";
import { downloadServiceAreasAsJson } from "./service-area-scrape-download";

interface ServiceAreaSelectorProps {
  site: WordPressSite;
  value: string | string[];
  onValueChange: (url: string | string[]) => void;
  disabled?: boolean;
  multiSelect?: boolean;
  onPostDataChange?: (postData: { id: number; subtype: string; link: string; slug?: string; endpoint?: string } | null) => void; // Callback to pass post data when selected
}

export const ServiceAreaSelector: React.FC<ServiceAreaSelectorProps> = ({
  site,
  value,
  onValueChange,
  disabled = false,
  multiSelect = false,
  onPostDataChange,
}) => {
  const { open, setOpen, serviceAreas, isLoading, searchQuery, setSearchQuery, getEntitySitemapUrl, fetchServiceAreas } = useServiceAreaData(site);

  const selectedUrls = multiSelect ? (Array.isArray(value) ? value : []) : [];
  const selectedUrl = multiSelect ? undefined : (typeof value === 'string' ? value : '');
  const selectedServiceArea = serviceAreas.find((serviceArea) => serviceArea.link === selectedUrl);
  const selectedServiceAreas = multiSelect ? serviceAreas.filter((serviceArea) => selectedUrls.includes(serviceArea.link)) : [];

  const filteredServiceAreas = serviceAreas.filter((serviceArea) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      serviceArea.title.toLowerCase().includes(query) ||
      serviceArea.link.toLowerCase().includes(query) ||
      serviceArea.slug.toLowerCase().includes(query)
    );
  });

  const filteredSelectedUrls = filteredServiceAreas.map((serviceArea) => serviceArea.link);
  const allFilteredSelected = filteredSelectedUrls.length > 0 && filteredSelectedUrls.every((url) => selectedUrls.includes(url));

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const newUrls = Array.from(new Set([...selectedUrls, ...filteredSelectedUrls]));
      onValueChange(newUrls);
    } else {
      const newUrls = selectedUrls.filter((url) => !filteredSelectedUrls.includes(url));
      onValueChange(newUrls);
    }
  };

  const handleToggleServiceArea = (serviceAreaUrl: string) => {
    if (selectedUrls.includes(serviceAreaUrl)) {
      onValueChange(selectedUrls.filter((url) => url !== serviceAreaUrl));
    } else {
      onValueChange([...selectedUrls, serviceAreaUrl]);
    }
  };

  return (
    <div className="space-y-2">
      <style>{`
        [data-radix-popover-content] [cmdk-item][data-selected="true"],
        [data-radix-popover-content] [cmdk-item][data-selected="true"] * {
          background-color: black !important;
          color: white !important;
        }
        [data-radix-popover-content] [cmdk-item]:hover,
        [data-radix-popover-content] [cmdk-item]:hover * {
          background-color: black !important;
          color: white !important;
        }
      `}</style>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            role="combobox"
            aria-expanded={open}
            disabled={disabled || isLoading || !site.username || !site.appPassword}
          >
            <span className="break-words">
              {multiSelect ? (
                selectedServiceAreas.length > 0 ? (
                  <span className="flex items-center gap-2">
                    <FileText className="h-3 w-3 shrink-0" />
                    {selectedServiceAreas.length === 1 ? (
                      selectedServiceAreas[0].link
                    ) : (
                      `${selectedServiceAreas.length} service areas selected`
                    )}
                  </span>
                ) : (
                  "Select service areas..."
                )
              ) : selectedServiceArea ? (
                <span className="flex items-center gap-2">
                  <FileText className="h-3 w-3 shrink-0" />
                  {selectedServiceArea.link}
                </span>
              ) : selectedUrl ? (
                selectedUrl
              ) : (
                "Select or enter service area URL..."
              )}
            </span>
            <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] min-w-[var(--radix-popover-trigger-width)] max-w-[min(100vw-1.5rem,var(--radix-popover-content-available-width))] border border-primary/30 bg-[#050505] p-0"
          align="start"
        >
          <Command className="bg-[#050505]">
            <CommandInput
              placeholder="Search service areas..."
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="bg-[#050505] border-0 border-b-0 text-primary placeholder:text-muted-foreground font-medium"
            />
            <div className={`flex items-center justify-between px-3 py-2 text-sm font-medium ${getCyberpunkTextClasses('muted')}`}>
              <span>{filteredServiceAreas.length} service area{filteredServiceAreas.length !== 1 ? 's' : ''} found</span>
              <Button
                variant="quiet"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  fetchServiceAreas();
                }}
                disabled={isLoading}
              >
                {isLoading ? (
                  null
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
              </Button>
            </div>
            <CommandList>
              <CommandEmpty>
                {isLoading ? (
                  <div className="flex items-center justify-center py-6 text-primary font-medium">
                    
                    Loading service areas...
                  </div>
                ) : (
                  <span className="text-foreground font-medium">No service areas found.</span>
                )}
              </CommandEmpty>
              <CommandGroup>
                {multiSelect && filteredServiceAreas.length > 0 && (
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-black hover:text-white transition-colors group"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleSelectAll(!allFilteredSelected);
                    }}
                  >
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={handleSelectAll}
                      onClick={(e) => e.stopPropagation()}
                      className="h-4 w-4 border-primary/50 data-[state=checked]:bg-primary/30 data-[state=checked]:border-primary"
                    />
                    <span className={cn(
                      "text-sm font-semibold",
                      allFilteredSelected ? "text-white" : "text-primary group-hover:text-white"
                    )}>Select All ({filteredServiceAreas.length})</span>
                  </div>
                )}
                {filteredServiceAreas.map((serviceArea) => {
                  const isSelected = multiSelect ? selectedUrls.includes(serviceArea.link) : selectedUrl === serviceArea.link;
                  return (
                    <CommandItem
                      key={serviceArea.id}
                      value={serviceArea.link}
                      onSelect={() => {
                        if (multiSelect) {
                          handleToggleServiceArea(serviceArea.link);
                        } else {
                          onValueChange(serviceArea.link);
                          
                          // Determine source: API items have date_gmt, sitemap items don't
                          const source = serviceArea.date_gmt ? 'api' : 'sitemap';
                          
                          if (source === 'sitemap') {
                            // Never treat sitemap items as resolved - always resolve URL
                            if (onPostDataChange) {
                              onPostDataChange(null);
                            }
                          } else if (source === 'api' && onPostDataChange) {
                            // API-loaded items have real WordPress IDs - pass full post data with endpoint
                            // Use entity endpoint extraction pattern (Content Optimizer module approach)
                            const entitySitemapUrl = getEntitySitemapUrl();
                            const entityEndpoint = entitySitemapUrl 
                              ? extractEndpointFromEntitySitemapUrl(entitySitemapUrl)
                              : 'posts';
                            onPostDataChange({
                              id: serviceArea.id,
                              subtype: entityEndpoint === 'posts' ? 'post' : entityEndpoint.replace(/s$/, ''),
                              link: serviceArea.link,
                              slug: serviceArea.slug,
                              endpoint: entityEndpoint,
                            });
                          }
                          
                          setOpen(false);
                        }
                      }}
                      className={cn(
                        "flex items-center py-2.5 px-3 rounded transition-colors group",
                        isSelected ? "bg-ui-field-hover/60 border border-primary/50" : "hover:bg-black hover:text-white border border-transparent",
                        "[&[data-selected='true']]:!bg-black [&[data-selected='true']]:!text-white"
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2.5 flex-1 min-w-0">
                          {multiSelect ? (
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => handleToggleServiceArea(serviceArea.link)}
                              onClick={(e) => e.stopPropagation()}
                              className="h-4 w-4 border-primary/50 data-[state=checked]:bg-primary/30 data-[state=checked]:border-primary"
                            />
                          ) : (
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0",
                                isSelected ? "opacity-100 text-white" : "opacity-0 text-primary"
                              )}
                            />
                          )}
                          <span className={cn(
                            "font-semibold text-sm break-words",
                            isSelected ? "text-white" : "text-primary group-hover:text-white"
                          )}>{serviceArea.title}</span>
                        </div>
                        {!multiSelect && isSelected && (
                          <Check className="h-4 w-4 text-white shrink-0" />
                        )}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Manual URL input as fallback - only show for single select */}
      {!multiSelect && (
        <div className="relative">
          <Field
            placeholder="Or enter URL manually"
            value={selectedUrl || ''}
            onChange={(e) => onValueChange(e.target.value)}
            disabled={disabled}
          />
          {selectedServiceArea && (
            <Button
              variant="quiet"
              onClick={() => window.open(selectedServiceArea.link, '_blank')}
              title="Open in new tab"
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
      {multiSelect && selectedServiceAreas.length > 0 && (
        <div className={`flex items-center justify-between text-xs ${getCyberpunkTextClasses('muted')}`}>
          <span>
            {selectedServiceAreas.length} service area{selectedServiceAreas.length !== 1 ? 's' : ''} selected
          </span>
          <Button
            variant="quiet"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void downloadServiceAreasAsJson({ site, selectedUrls, getEntitySitemapUrl });
            }}
            disabled={disabled || isLoading || !site.username || !site.appPassword}
            title="Download service area data as JSON"
          >
            <Download className="h-3 w-3 mr-1" />
            Scrape
          </Button>
        </div>
      )}
    </div>
  );
};

