import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { streamChatCompletion, Message, type GenerationResult } from "@/lib/api";
import type { AgentConfig } from "@/types/agent-config";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_COULD_NOT_GENERATE_A_VALID_CHECKLIST_PLE, NOTIFY_FAILED_TO_GENERATE_CHECKLIST_PLEASE_TRY_, NOTIFY_FAILED_TO_UPDATE_FINAL_REPORT_PLEASE_TRY, NOTIFY_FINAL_REPORT_UPDATED_SUCCESSFULLY, NOTIFY_NO_CHECKLIST_AVAILABLE, NOTIFY_PLEASE_PROVIDE_MODIFICATION_INSTRUCTIONS, NOTIFY_UPDATING_FINAL_REPORT_BASED_ON_CHECKLIST } from "@/lib/notify-messages";
import { 
  buildFlowAssistSystemPrompt, 
  buildChecklistGenerationPrompt, 
  buildFinalReportModificationPrompt, 
  generateSectionsPrompt 
} from "@/lib/prompt-builders";
import {
  parseMarkdownSections,
  extractSectionsWithContext,
  identifySectionsFromChecklist,
  mergeSectionsIntoMarkdown,
  validateSectionMerge,
} from "@/lib/section-parser";
import { useModificationTimer } from "./useModificationTimer";

interface UseFinalModificationProps {
  finalOutput: string;
  isModifyingFinal: boolean;
  finalModificationChecklist: string[];
  isGeneratingFinalChecklist: boolean;
  isUpdatingFinal: boolean;
  setFinalModificationChecklist?: (checklist: string[]) => void;
  setIsGeneratingFinalChecklist?: (isGenerating: boolean) => void;
  setIsUpdatingFinal?: (isUpdating: boolean) => void;
  setGenerationResult?: Dispatch<SetStateAction<GenerationResult>>;
  apiKey: string;
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  flowTitle: string;
  flowPurpose: string;
  agents: AgentConfig[];
  activeKnowledgeBaseText: string;
}

export function useFinalModification({
  finalOutput,
  isModifyingFinal,
  finalModificationChecklist,
  isGeneratingFinalChecklist,
  isUpdatingFinal,
  setFinalModificationChecklist,
  setIsGeneratingFinalChecklist,
  setIsUpdatingFinal,
  setGenerationResult,
  apiKey,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  flowTitle,
  flowPurpose,
  agents,
  activeKnowledgeBaseText,
}: UseFinalModificationProps) {
  const [finalChatMessages, setFinalChatMessages] = useState<Message[]>([]);
  const [finalUserInput, setFinalUserInput] = useState("");
  const [hasGeneratedFinalChecklist, setHasGeneratedFinalChecklist] = useState(false);
  const [finalUpdated, setFinalUpdated] = useState(false);
  const finalOutputRef = useRef<string>(finalOutput);
  const finalChatEndRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync with prop
  finalOutputRef.current = finalOutput;

  // Use timer hook
  const finalElapsedTime = useModificationTimer(isUpdatingFinal);

  // Reset chat when modification mode changes
  useEffect(() => {
    if (!isModifyingFinal) {
      setFinalChatMessages([]);
      setFinalUserInput("");
      setHasGeneratedFinalChecklist(false);
      setFinalUpdated(false);
    }
  }, [isModifyingFinal]);

  const handleGenerateFinalChecklist = useCallback(async () => {
    if (!finalUserInput.trim() || !apiKey || !setIsGeneratingFinalChecklist || !setFinalModificationChecklist) {
      notify.error(NOTIFY_PLEASE_PROVIDE_MODIFICATION_INSTRUCTIONS);
      return;
    }

    setIsGeneratingFinalChecklist(true);
    setFinalChatMessages(prev => [...prev, { role: 'user', content: finalUserInput }]);
    const userMessage = finalUserInput;
    setFinalUserInput("");

    try {
      // Build section structure info for checklist generation
      let sectionStructure = "";
      if (finalOutput) {
        const sections = parseMarkdownSections(finalOutput);
        if (sections.length > 0) {
          sectionStructure = "Available Sections:\n" + sections.map((section, idx) => 
            `${idx + 1}. [Section: ${"#".repeat(section.headerLevel)} ${section.header}]`
          ).join("\n");
        }
      }
      
      const systemPrompt = buildFlowAssistSystemPrompt(flowTitle, flowPurpose, finalOutput, activeKnowledgeBaseText, sectionStructure);
      const userPrompt = buildChecklistGenerationPrompt(userMessage, sectionStructure);

      let checklistContent = "";
      await streamChatCompletion({
        apiKey,
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        maxTokens,
        topP,
        onContentChunk: (chunk) => {
          checklistContent += chunk;
          setFinalChatMessages(prev => {
            const newMessages = [...prev];
            const lastMsg = newMessages[newMessages.length - 1];
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.content = checklistContent;
            } else {
              newMessages.push({ role: 'assistant', content: checklistContent });
            }
            return newMessages;
          });
        }
      });

      // Parse checklist from response
      const checklistItems = checklistContent
        .split('\n')
        .filter(line => line.trim().match(/^\d+[.)]\s+/))
        .map(line => line.replace(/^\d+[.)]\s+/, '').trim())
        .filter(item => item.length > 0);

      if (checklistItems.length < 3) {
        const altItems = checklistContent
          .split(/\n+/)
          .filter(line => line.trim().length > 0 && !line.trim().startsWith('#'))
          .slice(0, 10)
          .map(line => line.replace(/^[-*•]\s+/, '').trim())
          .filter(item => item.length > 0);
        
        if (altItems.length >= 3) {
          setFinalModificationChecklist(altItems);
          setHasGeneratedFinalChecklist(true);
        } else {
          notify.error(NOTIFY_COULD_NOT_GENERATE_A_VALID_CHECKLIST_PLE);
        }
      } else {
        setFinalModificationChecklist(checklistItems);
        setHasGeneratedFinalChecklist(true);
      }
    } catch (error) {
      console.error("Final checklist generation error:", error);
      notify.error(NOTIFY_FAILED_TO_GENERATE_CHECKLIST_PLEASE_TRY_);
      setFinalChatMessages(prev => prev.slice(0, -1));
    } finally {
      setIsGeneratingFinalChecklist(false);
    }
  }, [finalUserInput, apiKey, finalOutput, flowTitle, flowPurpose, activeKnowledgeBaseText, selectedModel, temperature, maxTokens, topP, setIsGeneratingFinalChecklist, setFinalModificationChecklist]);

  const handleUpdateFinal = useCallback(async () => {
    if (!finalModificationChecklist.length || !apiKey || !setIsUpdatingFinal || !setGenerationResult) {
      notify.error(NOTIFY_NO_CHECKLIST_AVAILABLE);
      return;
    }

    // Read the latest final output from ref to ensure we use the most recent value
    const currentFinalOutput = finalOutputRef.current;

    setIsUpdatingFinal(true);
    notify.info(NOTIFY_UPDATING_FINAL_REPORT_BASED_ON_CHECKLIST);

    try {
      const sectionsPrompt = generateSectionsPrompt(agents, "markdown");
      
      // Parse final output and identify affected sections
      const allSections = currentFinalOutput ? parseMarkdownSections(currentFinalOutput) : [];
      const { markdownSections } = identifySectionsFromChecklist(finalModificationChecklist, allSections);
      
      let isPartialContent = false;
      let sectionsToModify: string = "";
      let contextInfo = "";
      
      if (markdownSections.length > 0 && allSections.length > 0) {
        // Section-based modification: only modify specific sections
        isPartialContent = true;
        const sectionContext = extractSectionsWithContext(allSections, markdownSections, 1, 1);
        
        // Build content string with context
        const contentParts: string[] = [];
        if (sectionContext.beforeContext && sectionContext.beforeContext.length > 0) {
          contentParts.push("--- Context (Previous Sections) ---");
          sectionContext.beforeContext.forEach(s => contentParts.push(s.fullText));
        }
        contentParts.push("--- Sections to Modify ---");
        sectionContext.sections.forEach(s => contentParts.push(s.fullText));
        if (sectionContext.afterContext && sectionContext.afterContext.length > 0) {
          contentParts.push("--- Context (Following Sections) ---");
          sectionContext.afterContext.forEach(s => contentParts.push(s.fullText));
        }
        
        sectionsToModify = contentParts.join("\n\n");
        contextInfo = `Modifying ${markdownSections.length} section(s): ${markdownSections.map(s => s.header).join(", ")}`;
        
        const systemPrompt = buildFlowAssistSystemPrompt(flowTitle, flowPurpose, currentFinalOutput, activeKnowledgeBaseText);
        const userPrompt = buildFinalReportModificationPrompt(
          finalModificationChecklist, 
          sectionsToModify, 
          flowTitle, 
          flowPurpose, 
          sectionsPrompt,
          isPartialContent,
          contextInfo
        );

        let updatedSectionsContent = "";
        await streamChatCompletion({
          apiKey,
          model: selectedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature,
          maxTokens,
          topP,
          onContentChunk: (chunk) => {
            updatedSectionsContent += chunk;
            // Stream updates in real-time by merging as we go
            try {
              const partialSections = parseMarkdownSections(updatedSectionsContent);
              if (partialSections.length > 0) {
                const partialMerged = mergeSectionsIntoMarkdown(currentFinalOutput, partialSections, markdownSections);
                setGenerationResult((prev) => ({
                  ...prev,
                  final: partialMerged
                }));
              }
            } catch (e) {
              // Ignore parsing errors during streaming
            }
          }
        });

        if (updatedSectionsContent) {
          // Parse updated sections and merge back into full final output
          const updatedSections = parseMarkdownSections(updatedSectionsContent);
          const mergedFinal = mergeSectionsIntoMarkdown(currentFinalOutput, updatedSections, markdownSections);
          
          // Validate merge
          const validation = validateSectionMerge(allSections, mergedFinal);
          if (!validation.valid && validation.missing.length > 0) {
            console.warn("Some sections may be missing after merge:", validation.missing);
          }
          
          // Final update with complete merged content
          setGenerationResult((prev) => ({
            ...prev,
            final: mergedFinal
          }));
          notify.success(NOTIFY_FINAL_REPORT_UPDATED_SUCCESSFULLY);
          setFinalUpdated(true);
          setFinalChatMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `Final report has been updated based on the checklist. Modified ${markdownSections.length} section(s). Please review the updated report in the Final Report tab above.` 
          }]);
          return;
        } else {
          throw new Error("No final report content generated");
        }
      }
      
      // Fallback to full final modification if no specific sections identified
      const systemPrompt = buildFlowAssistSystemPrompt(flowTitle, flowPurpose, currentFinalOutput, activeKnowledgeBaseText);
      const userPrompt = buildFinalReportModificationPrompt(finalModificationChecklist, currentFinalOutput, flowTitle, flowPurpose, sectionsPrompt, false);

      let updatedFinalContent = "";
      await streamChatCompletion({
        apiKey,
        model: selectedModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature,
        maxTokens,
        topP,
        onContentChunk: (chunk) => {
          updatedFinalContent += chunk;
          // Stream updates in real-time
          setGenerationResult((prev) => ({
            ...prev,
            final: updatedFinalContent
          }));
        }
      });

      if (updatedFinalContent) {
        // Final update to ensure complete content is set
        setGenerationResult((prev) => ({
          ...prev,
          final: updatedFinalContent
        }));
        notify.success(NOTIFY_FINAL_REPORT_UPDATED_SUCCESSFULLY);
        setFinalUpdated(true);
        setFinalChatMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "Final report has been updated based on the checklist. Please review the updated report in the Final Report tab above." 
        }]);
      } else {
        throw new Error("No final report content generated");
      }
    } catch (error) {
      console.error("Final report update error:", error);
      notify.error(NOTIFY_FAILED_TO_UPDATE_FINAL_REPORT_PLEASE_TRY);
    } finally {
      setIsUpdatingFinal(false);
    }
  }, [finalModificationChecklist, apiKey, flowTitle, flowPurpose, agents, activeKnowledgeBaseText, selectedModel, temperature, maxTokens, topP, setIsUpdatingFinal, setGenerationResult]);

  return {
    finalChatMessages,
    finalUserInput,
    setFinalUserInput,
    hasGeneratedFinalChecklist,
    finalUpdated,
    finalElapsedTime,
    finalChatEndRef,
    handleGenerateFinalChecklist,
    handleUpdateFinal,
    setHasGeneratedFinalChecklist,
    setFinalUpdated,
    setFinalChatMessages,
  };
}

