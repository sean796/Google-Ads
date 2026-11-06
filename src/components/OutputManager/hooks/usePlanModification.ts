import { useState, useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";
import { streamChatCompletion, Message, type GenerationResult } from "@/lib/api";
import type { AgentConfig } from "@/types/agent-config";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_COULD_NOT_GENERATE_A_VALID_CHECKLIST_PLE, NOTIFY_FAILED_TO_GENERATE_CHECKLIST_PLEASE_TRY_, NOTIFY_FAILED_TO_UPDATE_PLAN_PLEASE_TRY_AGAIN, NOTIFY_NO_CHECKLIST_AVAILABLE, NOTIFY_PLAN_UPDATED_SUCCESSFULLY, NOTIFY_PLEASE_PROVIDE_MODIFICATION_INSTRUCTIONS, NOTIFY_UPDATING_PLAN_BASED_ON_CHECKLIST } from "@/lib/notify-messages";
import { 
  buildFlowAssistSystemPrompt, 
  buildChecklistGenerationPrompt, 
  buildPlanModificationPrompt, 
  generateSectionsPrompt 
} from "@/lib/prompt-builders";
import {
  parseMarkdownSections,
  extractSectionsWithContext,
  identifySectionsFromChecklist,
  mergeSectionsIntoMarkdown,
  validateSectionMerge,
} from "@/lib/section-parser";
import { logger } from "@/lib/logger";
import { useModificationTimer } from "./useModificationTimer";

interface UsePlanModificationProps {
  plan: string;
  isModifyingPlan: boolean;
  modificationChecklist: string[];
  isGeneratingChecklist: boolean;
  isUpdatingPlan: boolean;
  setModificationChecklist?: (checklist: string[]) => void;
  setIsGeneratingChecklist?: (isGenerating: boolean) => void;
  setIsUpdatingPlan?: (isUpdating: boolean) => void;
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

export function usePlanModification({
  plan,
  isModifyingPlan,
  modificationChecklist,
  isGeneratingChecklist,
  isUpdatingPlan,
  setModificationChecklist,
  setIsGeneratingChecklist,
  setIsUpdatingPlan,
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
}: UsePlanModificationProps) {
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [hasGeneratedChecklist, setHasGeneratedChecklist] = useState(false);
  const [planUpdated, setPlanUpdated] = useState(false);
  const planRef = useRef<string>(plan);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Keep ref in sync with prop
  planRef.current = plan;

  // Use timer hook
  const elapsedTime = useModificationTimer(isUpdatingPlan);

  // Reset chat when modification mode changes
  useEffect(() => {
    if (!isModifyingPlan) {
      setChatMessages([]);
      setUserInput("");
      setHasGeneratedChecklist(false);
      setPlanUpdated(false);
    }
  }, [isModifyingPlan]);

  const handleGenerateChecklist = useCallback(async () => {
    if (!userInput.trim() || !apiKey || !setIsGeneratingChecklist || !setModificationChecklist) {
      notify.error(NOTIFY_PLEASE_PROVIDE_MODIFICATION_INSTRUCTIONS);
      return;
    }

    setIsGeneratingChecklist(true);
    setChatMessages(prev => [...prev, { role: 'user', content: userInput }]);
    const userMessage = userInput;
    setUserInput("");

    try {
      // Build section structure info for checklist generation
      let sectionStructure = "";
      if (plan) {
        const sections = parseMarkdownSections(plan);
        if (sections.length > 0) {
          sectionStructure = "Available Sections:\n" + sections.map((section, idx) => 
            `${idx + 1}. [Section: ${"#".repeat(section.headerLevel)} ${section.header}]`
          ).join("\n");
        }
      }
      
      const systemPrompt = buildFlowAssistSystemPrompt(flowTitle, flowPurpose, plan, activeKnowledgeBaseText, sectionStructure);
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
          setChatMessages(prev => {
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
          setModificationChecklist(altItems);
          setHasGeneratedChecklist(true);
        } else {
          notify.error(NOTIFY_COULD_NOT_GENERATE_A_VALID_CHECKLIST_PLE);
        }
      } else {
        setModificationChecklist(checklistItems);
        setHasGeneratedChecklist(true);
      }
    } catch (error) {
      logger.error("Checklist generation error:", error);
      notify.error(NOTIFY_FAILED_TO_GENERATE_CHECKLIST_PLEASE_TRY_);
      setChatMessages(prev => prev.slice(0, -1));
    } finally {
      setIsGeneratingChecklist(false);
    }
  }, [userInput, apiKey, plan, flowTitle, flowPurpose, activeKnowledgeBaseText, selectedModel, temperature, maxTokens, topP, setIsGeneratingChecklist, setModificationChecklist]);

  const handleUpdatePlan = useCallback(async () => {
    if (!modificationChecklist.length || !apiKey || !setIsUpdatingPlan || !setGenerationResult) {
      notify.error(NOTIFY_NO_CHECKLIST_AVAILABLE);
      return;
    }

    // Read the latest plan from ref to ensure we use the most recent value
    const currentPlan = planRef.current;

    setIsUpdatingPlan(true);
    notify.info(NOTIFY_UPDATING_PLAN_BASED_ON_CHECKLIST);

    try {
      const sectionsPrompt = generateSectionsPrompt(agents, "markdown");
      
      // Parse plan and identify affected sections
      const allSections = currentPlan ? parseMarkdownSections(currentPlan) : [];
      const { markdownSections } = identifySectionsFromChecklist(modificationChecklist, allSections);
      
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
        
        const systemPrompt = buildFlowAssistSystemPrompt(flowTitle, flowPurpose, currentPlan, activeKnowledgeBaseText);
        const userPrompt = buildPlanModificationPrompt(
          modificationChecklist, 
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
                const partialMerged = mergeSectionsIntoMarkdown(currentPlan, partialSections, markdownSections);
                setGenerationResult((prev) => ({
                  ...prev,
                  plan: partialMerged
                }));
              }
            } catch (e) {
              // Ignore parsing errors during streaming
            }
          }
        });

        if (updatedSectionsContent) {
          // Parse updated sections and merge back into full plan
          const updatedSections = parseMarkdownSections(updatedSectionsContent);
          const mergedPlan = mergeSectionsIntoMarkdown(currentPlan, updatedSections, markdownSections);
          
          // Validate merge
          const validation = validateSectionMerge(allSections, mergedPlan);
          if (!validation.valid && validation.missing.length > 0) {
            logger.warn("Some sections may be missing after merge:", validation.missing);
            // Continue anyway, but log warning
          }
          
          // Final update with complete merged content
          setGenerationResult((prev) => ({
            ...prev,
            plan: mergedPlan
          }));
          notify.success(NOTIFY_PLAN_UPDATED_SUCCESSFULLY);
          setPlanUpdated(true);
          setChatMessages(prev => [...prev, { 
            role: 'assistant', 
            content: `Plan has been updated based on the checklist. Modified ${markdownSections.length} section(s). Please review the updated plan in the Plan tab above and choose to proceed or modify again.` 
          }]);
          return;
        } else {
          throw new Error("No plan content generated");
        }
      }
      
      // Fallback to full plan modification if no specific sections identified
      const systemPrompt = buildFlowAssistSystemPrompt(flowTitle, flowPurpose, currentPlan, activeKnowledgeBaseText);
      const userPrompt = buildPlanModificationPrompt(modificationChecklist, currentPlan, flowTitle, flowPurpose, sectionsPrompt, false);

      let updatedPlanContent = "";
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
          updatedPlanContent += chunk;
          // Stream updates in real-time
          setGenerationResult((prev) => ({
            ...prev,
            plan: updatedPlanContent
          }));
        }
      });

      if (updatedPlanContent) {
        // Final update to ensure complete content is set
        setGenerationResult((prev) => ({
          ...prev,
          plan: updatedPlanContent
        }));
        notify.success(NOTIFY_PLAN_UPDATED_SUCCESSFULLY);
        setPlanUpdated(true);
        setChatMessages(prev => [...prev, { 
          role: 'assistant', 
          content: "Plan has been updated based on the checklist. Please review the updated plan in the Plan tab above and choose to proceed or modify again." 
        }]);
      } else {
        throw new Error("No plan content generated");
      }
    } catch (error) {
      logger.error("Plan update error:", error);
      notify.error(NOTIFY_FAILED_TO_UPDATE_PLAN_PLEASE_TRY_AGAIN);
    } finally {
      setIsUpdatingPlan(false);
    }
  }, [modificationChecklist, apiKey, flowTitle, flowPurpose, agents, activeKnowledgeBaseText, selectedModel, temperature, maxTokens, topP, setIsUpdatingPlan, setGenerationResult]);

  return {
    chatMessages,
    userInput,
    setUserInput,
    hasGeneratedChecklist,
    planUpdated,
    elapsedTime,
    chatEndRef,
    handleGenerateChecklist,
    handleUpdatePlan,
    setHasGeneratedChecklist,
    setPlanUpdated,
    setChatMessages,
  };
}

