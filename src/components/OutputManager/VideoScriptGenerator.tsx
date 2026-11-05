import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Copy, CheckCircle2 } from "lucide-react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CHECKLIST_COPIED_TO_CLIPBOARD, NOTIFY_FAILED_TO_COPY_CHECKLIST, NOTIFY_NO_CHECKLIST_TO_COPY, NOTIFY_PLEASE_SET_YOUR_OPENROUTER_API_KEY_IN_SE, NOTIFY_VIDEO_SCRIPT_CHECKLIST_GENERATED, notifyChecklistGenerationFailedX } from "@/lib/notify-messages";
import { streamChatCompletion } from "@/lib/api";
import { buildVideoScriptChecklistSystemPrompt, buildVideoScriptChecklistUserPrompt, VideoScriptChecklistItem } from "@/lib/video-script-checklist-builder";
import { parseMarkdownSections } from "@/lib/section-parser";
import { VideoScriptGeneratorProps } from "./types";
import { Button, SelectField, TextareaField } from "@/ui";

export const VideoScriptGenerator = ({
  apiKey = "",
  flowTitle = "",
  flowPurpose = "",
  agents = [],
  finalOutput = "",
  selectedModel = getResearchModel(),
  temperature = 1.57,
  maxTokens = 5000000,
  topP = 0.90,
}: VideoScriptGeneratorProps) => {
  const [userPrompt, setUserPrompt] = useState("");
  const [videoSourceMode, setVideoSourceMode] = useState<'full' | 'section'>('full');
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [includeOnScreenText, setIncludeOnScreenText] = useState(true);
  const [includeBrollNotes, setIncludeBrollNotes] = useState(true);
  const [includeVoiceoverOnlyScenes, setIncludeVoiceoverOnlyScenes] = useState(false);
  const [targetDuration, setTargetDuration] = useState<'30-45s' | '45-60s' | '60-90s'>('60-90s');
  const [platformStyle] = useState<'short-vertical'>('short-vertical');
  const [isGeneratingChecklist, setIsGeneratingChecklist] = useState(false);
  const [videoChecklist, setVideoChecklist] = useState<VideoScriptChecklistItem[]>([]);
  const [hasGeneratedChecklist, setHasGeneratedChecklist] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parse sections from finalOutput
  const availableSections = useMemo(() => {
    if (!finalOutput) return [];
    return parseMarkdownSections(finalOutput);
  }, [finalOutput]);

  // Clear selected section when switching back to full mode
  useEffect(() => {
    if (videoSourceMode === 'full') {
      setSelectedSection(null);
    }
  }, [videoSourceMode]);

  const handleGenerateChecklist = async () => {
    if (!apiKey) {
      notify.error(NOTIFY_PLEASE_SET_YOUR_OPENROUTER_API_KEY_IN_SE);
      return;
    }

    // Allow generation even without section selection - will use user prompt and options
    const effectiveMode = (videoSourceMode === 'section' && !selectedSection) ? 'full' : videoSourceMode;

    setIsGeneratingChecklist(true);
    setError(null);
    setVideoChecklist([]);

    try {
      // Get selected section object if in section mode
      const selectedSectionObj = effectiveMode === 'section' && selectedSection
        ? availableSections.find(s => s.header === selectedSection)
        : undefined;

      const systemPrompt = buildVideoScriptChecklistSystemPrompt(
        flowTitle, 
        flowPurpose, 
        effectiveMode === 'full' ? finalOutput : undefined,
        selectedSectionObj,
        userPrompt.trim() || undefined,
        targetDuration,
        platformStyle
      );
      const userPromptText = buildVideoScriptChecklistUserPrompt({
        flowTitle,
        flowPurpose,
        agents,
        finalOutput: effectiveMode === 'full' ? finalOutput : undefined,
        selectedSection: selectedSectionObj,
        userPrompt: userPrompt.trim() || undefined,
        includeOnScreenText,
        includeBrollNotes,
        includeVoiceoverOnlyScenes,
        targetDuration,
        platformStyle,
      });

      let checklistContent = "";
      await streamChatCompletion({
        apiKey,
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPromptText }
        ],
        temperature,
        maxTokens,
        topP,
        onContentChunk: (chunk) => {
          checklistContent += chunk;
        }
      });

      // Parse checklist from response - looking for title/description format
      const lines = checklistContent.split('\n').map(line => line.trim());
      const parsedItems: VideoScriptChecklistItem[] = [];
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
          description: currentDescription.length > 0 
            ? currentDescription.join(' ') 
            : "Planning video script scene based on content and specifications."
        });
      }

      // Fallback parsing if structured format not found
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

      // Final fallback: create simple items from numbered/bulleted list or any substantial lines
      if (parsedItems.length === 0) {
        const simpleItems: VideoScriptChecklistItem[] = [];
        const numberedItems = checklistContent
          .split('\n')
          .map(line => line.trim())
          .filter(line => /^\d+[\.\)]\s+/.test(line) || /^[-*]\s+/.test(line));
        
        if (numberedItems.length > 0) {
          numberedItems.forEach(line => {
            const text = line.replace(/^\d+[\.\)]\s+/, '').replace(/^[-*]\s+/, '').trim();
            if (text.length > 0) {
              simpleItems.push({
                title: text.length > 60 ? text.substring(0, 60) + '...' : text,
                description: text
              });
            }
          });
        }
        
        if (simpleItems.length > 0) {
          setVideoChecklist(simpleItems);
        } else {
          setVideoChecklist([{
            title: "Video Script Generation Requirements",
            description: "Generate video script based on content and user preferences."
          }]);
        }
      } else {
        setVideoChecklist(parsedItems);
      }

      setHasGeneratedChecklist(true);
      notify.success(NOTIFY_VIDEO_SCRIPT_CHECKLIST_GENERATED);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to generate checklist";
      setError(errorMessage);
      notify.error(notifyChecklistGenerationFailedX(errorMessage));
    } finally {
      setIsGeneratingChecklist(false);
    }
  };

  const handleCopyChecklist = () => {
    if (videoChecklist.length === 0) {
      notify.error(NOTIFY_NO_CHECKLIST_TO_COPY);
      return;
    }

    const markdown = videoChecklist.map((item, index) => {
      return `## ${item.title}\n\n${item.description}`;
    }).join('\n\n');

    navigator.clipboard.writeText(markdown).then(() => {
      notify.success(NOTIFY_CHECKLIST_COPIED_TO_CLIPBOARD);
    }).catch(() => {
      notify.error(NOTIFY_FAILED_TO_COPY_CHECKLIST);
    });
  };

  return (
    <div className="flex flex-col h-full p-6 space-y-4">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Video Generator</h2>
          <p className="text-sm text-muted-foreground">
            Generate a video script checklist optimized for Descript and similar AI video platforms. This creates a scene-by-scene breakdown for short-form vertical content (TikTok/Reels/Shorts), not an actual video preview.
          </p>
        </div>

        {/* Video Source Selection */}
        <div className="space-y-2">
          <label className="text-foreground text-sm">Video Source:</label>
          <RadioGroup
            value={videoSourceMode}
            onValueChange={(value) => setVideoSourceMode(value as 'full' | 'section')}
            disabled={isGeneratingChecklist}
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="full" id="source-full" />
              <label htmlFor="source-full" className="text-foreground font-normal cursor-pointer text-sm">
                Full Content (uses entire report)
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="section" id="source-section" />
              <label htmlFor="source-section" className="text-foreground font-normal cursor-pointer text-sm">
                Specific Section (select a section from the report)
              </label>
            </div>
          </RadioGroup>
        </div>

        {/* Section Selection Dropdown */}
        {videoSourceMode === 'section' && (
          <div className="space-y-2">
            
            <SelectField placeholder="Select Section" value={selectedSection || ""} onValueChange={(value) => setSelectedSection(value)} disabled={isGeneratingChecklist || availableSections.length === 0} options={availableSections.map((section, index) => ({ value: section.header, label: section.header }))} />
            {selectedSection && (
              <p className="text-xs text-muted-foreground">
                Video script will be generated based on the "{selectedSection}" section.
              </p>
            )}
          </div>
        )}

        {/* Optional Prompt Input */}
        <div className="space-y-2">
          <label htmlFor="video-prompt" className="text-foreground text-sm">
            Optional Prompt
          </label>
          <TextareaField
            id="video-prompt"
            placeholder="Describe how you'd like the video script structured (e.g., 'focus on benefits', 'use only real testimonials you paste above', 'fast-paced editing')..."
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            disabled={isGeneratingChecklist}
          />
        </div>

        {/* Video Settings */}
        <div className="space-y-3">
          <label className="text-foreground text-sm font-medium">Video Settings</label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              
              <SelectField placeholder="Target Duration" value={targetDuration} onValueChange={(value: typeof targetDuration) => setTargetDuration(value)} disabled={isGeneratingChecklist} options={[{ value: "30-45s", label: "30-45 seconds" }, { value: "45-60s", label: "45-60 seconds" }, { value: "60-90s", label: "60-90 seconds" }]} />
            </div>
          </div>
        </div>

        {/* Include in Script Options */}
        <div className="space-y-2">
          <label className="text-foreground text-sm">Include in Script:</label>
          <div className="grid grid-cols-1 gap-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-on-screen-text"
                checked={includeOnScreenText}
                onCheckedChange={(checked) => setIncludeOnScreenText(checked === true)}
                disabled={isGeneratingChecklist}
              />
              <label
                htmlFor="include-on-screen-text"
                className="text-foreground font-normal cursor-pointer text-sm"
              >
                On-screen text overlays (subtitles, key words, callouts)
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-broll-notes"
                checked={includeBrollNotes}
                onCheckedChange={(checked) => setIncludeBrollNotes(checked === true)}
                disabled={isGeneratingChecklist}
              />
              <label
                htmlFor="include-broll-notes"
                className="text-foreground font-normal cursor-pointer text-sm"
              >
                B-roll and visual suggestions
              </label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-voiceover-only"
                checked={includeVoiceoverOnlyScenes}
                onCheckedChange={(checked) => setIncludeVoiceoverOnlyScenes(checked === true)}
                disabled={isGeneratingChecklist}
              />
              <label
                htmlFor="include-voiceover-only"
                className="text-foreground font-normal cursor-pointer text-sm"
              >
                Allow voiceover-only scenes (no complex visuals)
              </label>
            </div>
          </div>
        </div>

        {/* Generate Checklist Button */}
        {!hasGeneratedChecklist && (
          <Button
            variant="run"
            onClick={handleGenerateChecklist}
            disabled={isGeneratingChecklist || !apiKey}
          >
            {isGeneratingChecklist ? (
              <>
                
                Generating Checklist...
              </>
            ) : (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Generate Video Script Checklist
              </>
            )}
          </Button>
        )}

        {/* Checklist Display */}
        {hasGeneratedChecklist && videoChecklist.length > 0 && (
          <div className="space-y-4 p-4 bg-background border border-border rounded-md">
            <div className="flex items-center justify-between">
              <label className="text-foreground font-semibold text-base">Video Script Checklist:</label>
              <Button
                onClick={handleCopyChecklist}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy Markdown
              </Button>
            </div>
            <div className="space-y-4">
              {videoChecklist.map((item, index) => (
                <div key={index} className="space-y-2 pb-3 border-b border-border last:border-b-0 last:pb-0">
                  <h4 className="text-sm font-semibold text-foreground leading-tight">
                    {item.title}
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed pl-2">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4 pt-3 border-t border-border">
              <Button
                onClick={handleGenerateChecklist}
                disabled={isGeneratingChecklist || !apiKey}
              >
                {isGeneratingChecklist ? (
                  <>
                    
                    Regenerating...
                  </>
                ) : (
                  "Regenerate Checklist"
                )}
              </Button>
            </div>
          </div>
        )}

        {!apiKey && (
          <p className="text-sm text-muted-foreground">
            Please set your OpenRouter API key in Settings to generate video script checklists.
          </p>
        )}

        {/* Error Display */}
        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
};

