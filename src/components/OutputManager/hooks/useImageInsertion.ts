import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import type { GenerationResult } from "@/lib/api";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CANNOT_INSERT_IMAGE_FINAL_OUTPUT_NOT_AVA, NOTIFY_FAILED_TO_INSERT_IMAGE_INTO_SECTION, notifyImageInsertedIntoXSection, notifySectionXNotFoundPleaseCheckTheSec } from "@/lib/notify-messages";
import { insertContentIntoSection } from "@/lib/section-parser";
import { logger } from "@/lib/logger";

interface UseImageInsertionProps {
  finalOutput: string;
  setGenerationResult?: Dispatch<SetStateAction<GenerationResult>>;
}

export function useImageInsertion({ finalOutput, setGenerationResult }: UseImageInsertionProps) {
  const finalOutputRef = useRef<string>(finalOutput);
  
  // Keep ref in sync with prop
  finalOutputRef.current = finalOutput;

  const handleInsertImageIntoSection = useCallback((sectionHeader: string, imageMarkdown: string) => {
    // Use ref to get the most recent finalOutput value
    const currentFinalOutput = finalOutputRef.current;
    
    if (!currentFinalOutput || !setGenerationResult) {
      notify.error(NOTIFY_CANNOT_INSERT_IMAGE_FINAL_OUTPUT_NOT_AVA);
      return;
    }
    
    try {
      
      const updatedOutput = insertContentIntoSection(currentFinalOutput, sectionHeader, imageMarkdown, 'end');
      
      
      if (updatedOutput === currentFinalOutput) {
        logger.warn('No change detected - section may not have been found');
        notify.error(notifySectionXNotFoundPleaseCheckTheSec(sectionHeader));
        return;
      }
      
      setGenerationResult((prev) => ({
        ...prev,
        final: updatedOutput
      }));
      
      notify.success(notifyImageInsertedIntoXSection(sectionHeader));
    } catch (error) {
      logger.error("Error inserting image:", error);
      notify.error(NOTIFY_FAILED_TO_INSERT_IMAGE_INTO_SECTION);
    }
  }, [setGenerationResult]);

  return { handleInsertImageIntoSection };
}

