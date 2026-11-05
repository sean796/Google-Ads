import React from "react";
import { Map, MapPin } from "lucide-react";
import { type WordPressSite } from "../types";
import { LocationSelector } from "./LocationSelector";
import { getCyberpunkTextClasses, getCyberpunkButtonClasses } from "./cyberpunk-theme";
import { Button } from "@/ui";

interface LocationsSectionProps {
  site: WordPressSite;
  isDetectingLocations: boolean;
  onDetectLocations?: () => void;
}

export const LocationsSection: React.FC<LocationsSectionProps> = ({
  site,
  isDetectingLocations,
  onDetectLocations,
}) => {
  const hasLocations = (site.locations && site.locations.length > 0) || 
                      (site.napInfo?.locations && site.napInfo.locations.length > 0);

  return (
    <div className="mt-4 pt-4">
      <div className="flex items-center justify-between mb-3">
        <label className={`text-sm font-semibold ${getCyberpunkTextClasses('primary')} uppercase tracking-wider`}>
          Locations
        </label>
        {onDetectLocations && (
          <Button
            onClick={onDetectLocations}
            disabled={isDetectingLocations || site.enabled === false}
          >
            {isDetectingLocations ? (
              <>
                
                Detecting...
              </>
            ) : (
              <>
                <Map className="h-3 w-3 mr-1" />
                Detect Locations
              </>
            )}
          </Button>
        )}
      </div>
      {hasLocations ? (
        <div className="bg-primary/5 rounded p-3">
          <LocationSelector site={site} />
        </div>
      ) : (
        <div className="p-4 bg-primary/5 rounded text-center">
          <MapPin className="h-5 w-5 mx-auto mb-2 text-primary/50" />
          <p className={`text-sm ${getCyberpunkTextClasses('muted')}`}>
            No locations detected. Click "Detect Locations" to extract NAP information from the site.
          </p>
        </div>
      )}
    </div>
  );
};

