import React from "react";
import { Search, X } from "lucide-react";
import { getCyberpunkButtonClasses } from "./cyberpunk-theme";
import { Button, Field } from "@/ui";

interface SiteSearchFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const SiteSearchFilter: React.FC<SiteSearchFilterProps> = ({
  searchQuery,
  onSearchChange,
}) => {
  return (
    <div className="relative">
      <div className="relative flex items-center">
        <Search className="absolute left-2 h-3.5 w-3.5 text-white/50" />
        <Field
          type="text"
          placeholder="Search sites by name..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <Button
            variant="quiet"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
};
