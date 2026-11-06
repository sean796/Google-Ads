import {
  IMAGE_SCENE_PLAUSIBILITY_CHECKLIST_TITLE,
  IMAGE_SCENE_PLAUSIBILITY_PROMPT,
  hasPhysicalScenePlausibilityItem,
} from "@/lib/image-scene-plausibility";
import type { ImageChecklistItem } from "./image-checklist-types";

/**
 * Parses AI-generated image checklist response into structured ImageChecklistItem array
 */
export function parseImageChecklist(
  aiResponse: string,
  options?: { strictFeatured?: boolean },
): ImageChecklistItem[] {
  const strictFeatured = options?.strictFeatured === true;
  const lines = aiResponse.split('\n').map(line => line.trim());
  const parsedItems: ImageChecklistItem[] = [];
  let currentTitle: string | null = null;
  let currentDescription: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    
    // Skip empty lines - they separate title from description or items from each other
    if (!line) {
      // If we have both title and description, save the item
      if (currentTitle && currentDescription.length > 0) {
        parsedItems.push({
          title: currentTitle,
          description: currentDescription.join(' ')
        });
        currentTitle = null;
        currentDescription = [];
      }
      i++;
      continue;
    }

    // Check if this line is a title (not starting with "I'm"/"I am", typically shorter, capitalized)
    const isTitleCandidate = line.length < 120 && 
                             line.length > 3 &&
                             !line.startsWith("I'm") && 
                             !line.startsWith("I am") &&
                             !line.startsWith("I'm currently") &&
                             !line.startsWith("I'm now") &&
                             !line.match(/^[a-z]/); // Starts with capital

    // Check if this line is a description (starts with "I'm" or "I am")
    const isDescription = line.startsWith("I'm") || 
                          line.startsWith("I am") ||
                          line.startsWith("I'm currently") ||
                          line.startsWith("I'm now");

    if (isTitleCandidate && !currentTitle) {
      // Look ahead to see if next non-empty line is a description
      let j = i + 1;
      while (j < lines.length && !lines[j]) j++;
      
      if (j < lines.length && 
          (lines[j].startsWith("I'm") || lines[j].startsWith("I am"))) {
        // This is a title, next line is description
        currentTitle = line;
        i = j; // Move to description line
        continue;
      } else if (j < lines.length && lines[j].length > 50) {
        // Next line is long, might be description without "I'm"
        currentTitle = line;
        i = j;
        continue;
      }
    }

    // If we have a title and this is a description, add it
    if (currentTitle && (isDescription || (currentDescription.length > 0 && line.length > 20))) {
      if (isDescription || currentDescription.length > 0) {
        currentDescription.push(line);
      }
    } else if (currentTitle && currentDescription.length > 0) {
      // We have a complete item, but this line doesn't continue the description
      // Check if it's a new title
      if (isTitleCandidate) {
        // Save current item and start new one
        parsedItems.push({
          title: currentTitle,
          description: currentDescription.join(' ')
        });
        currentTitle = line;
        currentDescription = [];
      } else {
        // Might be continuation of description
        currentDescription.push(line);
      }
    } else if (!currentTitle && isTitleCandidate) {
      // Start new item
      currentTitle = line;
    }

    i++;
  }

  // Save last item if exists
  if (currentTitle) {
    parsedItems.push({
      title: currentTitle,
      description:
        currentDescription.length > 0
          ? currentDescription.join(" ")
          : IMAGE_SCENE_PLAUSIBILITY_PROMPT,
    });
  }

  // Secondary parse pass when structured format not found on first pass
  if (parsedItems.length === 0) {
    // Try pattern: Title (non-empty, not starting with I'm) followed by description (starts with I'm)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      
      // Look for title pattern
      if (line.length < 100 && line.length > 5 && 
          line[0] === line[0].toUpperCase() && 
          !line.startsWith("I'm") && !line.startsWith("I am")) {
        // Find next non-empty line as description
        let j = i + 1;
        while (j < lines.length && !lines[j]) j++;
        
        if (j < lines.length) {
          const descLine = lines[j];
          if (descLine.startsWith("I'm") || descLine.startsWith("I am") || descLine.length > 30) {
            parsedItems.push({
              title: line,
              description: descLine
            });
            i = j; // Skip description
          }
        }
      }
    }
  }

  if (parsedItems.length === 0) {
    parsedItems.push({
      title: IMAGE_SCENE_PLAUSIBILITY_CHECKLIST_TITLE,
      description: IMAGE_SCENE_PLAUSIBILITY_PROMPT,
    });
  }
  if (strictFeatured && !hasPhysicalScenePlausibilityItem(parsedItems)) {
    parsedItems.push({
      title: IMAGE_SCENE_PLAUSIBILITY_CHECKLIST_TITLE,
      description: IMAGE_SCENE_PLAUSIBILITY_PROMPT,
    });
  }
  return parsedItems;
}
