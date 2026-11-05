import React, { useRef, useEffect } from "react";
import { X, Edit, Send, CheckCircle2, User, List } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Message } from "@/lib/api";
import { formatElapsedTime } from "./utils";
import { VersusIcon, AEOIcon, LocalIcon } from "@/components/ui/blog-shortcut-icons";
import { Button, TextareaField } from "@/ui";

interface ModificationChatProps {
  isActive: boolean;
  title: string;
  chatMessages: Message[];
  userInput: string;
  onUserInputChange: (value: string) => void;
  checklist: string[];
  isGeneratingChecklist: boolean;
  isUpdating: boolean;
  elapsedTime: number;
  hasGeneratedChecklist: boolean;
  updated: boolean;
  placeholder: string;
  emptyStateMessage: string;
  emptyStateExample: string;
  updateButtonLabel: string;
  processingTitle: string;
  updatedMessage: string;
  proceedButtonLabel: string;
  onGenerateChecklist: () => void;
  onUpdate: () => void;
  onCancel: () => void;
  onProceed?: () => void;
  onModifyAgain: () => void;
  onModifyChecklist: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
  variant?: 'default' | 'draft'; // draft has different styling
  onShortcutClick?: (type: 'versus' | 'aeo' | 'local') => void; // Shortcut button handlers
  showShortcuts?: boolean; // Whether to show shortcut buttons
  /** Optional override for height/max-height so this component can fit inside constrained layouts. */
  containerHeight?: number | string;
  /** Optional override for max-height so this component can fit inside constrained layouts. */
  containerMaxHeight?: number | string;
  /** When true, hides the cancel/X affordance even if `onCancel` is provided. */
  hideCancelX?: boolean;
}

export const ModificationChat = ({
  isActive,
  title,
  chatMessages,
  userInput,
  onUserInputChange,
  checklist,
  isGeneratingChecklist,
  isUpdating,
  elapsedTime,
  hasGeneratedChecklist,
  updated,
  placeholder,
  emptyStateMessage,
  emptyStateExample,
  updateButtonLabel,
  processingTitle,
  updatedMessage,
  proceedButtonLabel,
  onGenerateChecklist,
  onUpdate,
  onCancel,
  onProceed,
  onModifyAgain,
  onModifyChecklist,
  chatEndRef,
  variant = 'default',
  onShortcutClick,
  showShortcuts = false,
  containerHeight,
  containerMaxHeight,
  hideCancelX = false
}: ModificationChatProps) => {
  const isDraftVariant = variant === 'draft';
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const toCssSize = (v: number | string | undefined) => {
    if (v === undefined) return undefined;
    return typeof v === "number" ? `${v}px` : v;
  };

  const style: React.CSSProperties = {
    ...(isDraftVariant
      ? { maxHeight: "450px", minHeight: "380px", height: "450px" }
      : { maxHeight: "80vh", height: "80vh" }),
    ...(containerHeight !== undefined ? { height: toCssSize(containerHeight) } : null),
    ...(containerMaxHeight !== undefined ? { maxHeight: toCssSize(containerMaxHeight) } : null),
  };

  // Scroll to bottom of chat when messages change
  const scrollToBottom = () => {
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }, 0);
  };

  useEffect(() => {
    if (isActive) {
      scrollToBottom();
    }
  }, [chatMessages, checklist, isActive]);

  if (!isActive) return null;

  return (
    <div 
      className={`flex flex-col border-0 bg-card w-full rounded-lg shadow-sm overflow-hidden ${
        isDraftVariant ? "ring-2 ring-primary/45 shadow-lg" : ""
      }`}
      style={style}
    >
      {/* Sticky Header Section */}
      <div className="sticky top-0 z-10 bg-card">
        {/* Header with Title and Navigation Controls */}
        <div className={`flex items-center justify-between ${isDraftVariant ? 'px-6' : 'px-4'} py-3 flex-shrink-0 ${
          isDraftVariant ? 'bg-primary/10' : 'bg-muted/30'
        }`}>
          <h3 className={`text-sm font-semibold text-foreground ${!isDraftVariant ? 'flex items-center gap-2' : ''}`}>
            {!isDraftVariant && <Edit className="h-4 w-4" />}
            {title}
          </h3>
          {onCancel && !hideCancelX && (
            isDraftVariant ? (
              <Button variant="quiet" icon={X} onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Button size="icon" variant="quiet" icon={X} aria-label="Cancel" onClick={onCancel} />
            )
          )}
        </div>

        {/* Shortcut Buttons Section - Blog Generation Types */}
        {showShortcuts && !hasGeneratedChecklist && !updated && onShortcutClick && (
          <div className={`${isDraftVariant ? 'px-6' : 'px-4'} py-2 flex-shrink-0 ${
            isDraftVariant ? 'bg-background/50' : 'bg-muted/20'
          }`}>
            <div className="flex gap-3 items-start w-full">
              <div className="pt-1 rounded-md bg-primary/5 pl-3 pr-2">
                <span className="text-xs text-muted-foreground font-medium">Quick Start:</span>
              </div>
              <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
                <Button icon={VersusIcon} onClick={() => onShortcutClick('versus')} disabled={isGeneratingChecklist}>
                  Versus Posts
                </Button>
                <Button icon={AEOIcon} onClick={() => onShortcutClick('aeo')} disabled={isGeneratingChecklist}>
                  AEO Posts
                </Button>
                <Button icon={LocalIcon} onClick={() => onShortcutClick('local')} disabled={isGeneratingChecklist}>
                  Local Posts
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Input Section - Generation Actions */}
        {!hasGeneratedChecklist && !updated && (
          <div className={`${isDraftVariant ? 'px-6' : 'px-4'} py-3 flex-shrink-0 ${
            isDraftVariant ? 'bg-background/50' : 'bg-muted/30'
          }`}>
            <div className="flex gap-2">
              <TextareaField
                value={userInput}
                onChange={(e) => onUserInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    onGenerateChecklist();
                  }
                }}
                placeholder={placeholder}
                disabled={isGeneratingChecklist}
              />
              <Button
                size="icon"
                variant="run"
                icon={Send}
                aria-label="Send"
                onClick={onGenerateChecklist}
                disabled={!userInput.trim() || isGeneratingChecklist}
              />
            </div>
          </div>
        )}

        {/* Action Buttons Section - Grouped by Utility */}
        {hasGeneratedChecklist && checklist.length > 0 && !updated && (
          <div className={`${isDraftVariant ? 'px-6' : 'px-4'} py-3 flex-shrink-0 ${
            isDraftVariant ? 'bg-background/50' : 'bg-muted/30'
          }`}>
            <div className="flex gap-3 items-center">
              {/* Apply/Proceed Actions Group */}
              <div className="flex gap-2 items-center">
                <Button variant="run" icon={CheckCircle2} onClick={onUpdate} disabled={isUpdating}>
                  {updateButtonLabel}
                </Button>
              </div>
              
              {/* Modification Actions Group */}
              <div className="flex gap-2 items-center pl-1">
                <Button icon={Edit} onClick={onModifyChecklist}>
                  Modify Checklist
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons Section - After Update */}
        {updated && !isUpdating && (
          <div className={`${isDraftVariant ? 'px-6' : 'px-4'} py-3 flex-shrink-0 ${
            isDraftVariant ? 'bg-background/50' : 'bg-muted/30'
          }`}>
            <div className="flex gap-3 items-center">
              {/* Apply/Proceed Actions Group */}
              {onProceed && (
                <div className="flex gap-2 items-center">
                  <Button variant="run" icon={CheckCircle2} onClick={onProceed}>
                    {proceedButtonLabel}
                  </Button>
                </div>
              )}
              
              {/* Modification Actions Group */}
              <div className={`flex gap-2 items-center ${onProceed ? "pl-1" : ""}`}>
                <Button icon={Edit} onClick={onModifyAgain}>
                  Modify Again
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat Messages - Scrollable content */}
      <div ref={scrollContainerRef} className="flex-1 min-h-0 overflow-y-scroll custom-scrollbar">
        <div className={`${isDraftVariant ? 'px-6' : 'px-4'} py-4 ${isDraftVariant ? '' : 'space-y-4'}`}>
          {chatMessages.length === 0 && !hasGeneratedChecklist && (
            <div className={`text-sm text-muted-foreground ${isDraftVariant ? 'mb-4' : 'text-center py-8'}`}>
              <p className="mb-2 font-medium">{emptyStateMessage}</p>
              <p className={`text-xs ${isDraftVariant ? '' : 'opacity-75'}`}>{emptyStateExample}</p>
            </div>
          )}

          {chatMessages.map((msg, idx) => {
            if (isDraftVariant) {
              return (
                <div key={idx} className={`mb-4 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                  <div className={`inline-block max-w-[80%] rounded-lg p-3 ${
                    msg.role === 'user' 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-foreground'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div key={idx} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                  msg.role === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-muted-foreground'
                }`}>
                  {msg.role === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Edit className="h-4 w-4" />
                  )}
                </div>
                <div className={`flex-1 max-w-[85%] rounded-lg p-3 ${
                  msg.role === 'user' 
                    ? 'bg-primary text-primary-foreground' 
                    : 'bg-muted text-foreground'
                }`}>
                  {msg.role === 'assistant' ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        a: ({ node, ...rest }: any) => <a {...rest} target="_blank" rel="noopener noreferrer" className="text-semantic-publish-foreground hover:text-semantic-publish-foreground underline" />,
                        p: ({ children }) => <p className="text-sm leading-relaxed last:mb-0 mb-2">{children}</p>,
                        code: ({ children }) => <code className="bg-background/50 rounded px-1.5 py-0.5 text-xs font-mono">{children}</code>,
                        pre: ({ children }) => <pre className="p-2 rounded-md overflow-x-auto text-xs bg-background/50 font-mono my-2">{children}</pre>,
                        ul: ({ children }) => <ul className="list-disc ml-4 space-y-1 my-2 text-sm">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal ml-4 space-y-1 my-2 text-sm">{children}</ol>,
                        li: ({ children }) => <li className="pl-0 my-1 text-sm">{children}</li>,
                        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-sm font-bold mb-1 mt-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-sm font-semibold mb-1 mt-1">{children}</h3>,
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  )}
                </div>
              </div>
            );
          })}

          {/* Checklist Display - Show before update */}
          {hasGeneratedChecklist && checklist.length > 0 && !updated && (
            <div className={isDraftVariant ? "mb-4 p-4 bg-card rounded-lg shadow-sm" : "flex items-start gap-3"}>
              {!isDraftVariant && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
                  <List className="h-4 w-4" />
                </div>
              )}
              <div className={isDraftVariant ? "" : "flex-1 bg-muted rounded-lg p-4"}>
                <h4 className="text-sm font-semibold mb-3 text-foreground">Modification Checklist:</h4>
                <ol className={`list-decimal ${isDraftVariant ? 'list-inside' : 'ml-4'} space-y-2 text-sm text-foreground`}>
                  {checklist.map((item, idx) => (
                    <li key={idx} className={isDraftVariant ? "" : "leading-relaxed"}>{item}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* Processing Timer Display - Show during update */}
          {isUpdating && (
            <div className={isDraftVariant 
              ? "mb-4 p-6 bg-primary/10 rounded-lg ring-2 ring-primary/45 flex flex-col items-center justify-center"
              : "flex items-start gap-3"
            }>
              {isDraftVariant ? (
                <>
                  
                  <h4 className="text-lg font-semibold mb-2 text-foreground">{processingTitle}</h4>
                  <div className="flex items-center gap-2 text-2xl font-mono font-bold text-primary">
                    <span>{formatElapsedTime(elapsedTime)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">Updating based on checklist...</p>
                </>
              ) : (
                <>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                    
                  </div>
                  <div className="flex-1 bg-primary/10 rounded-lg p-4 ring-1 ring-primary/25">
                    <h4 className="text-sm font-semibold mb-2 text-foreground">{processingTitle}</h4>
                    <div className="flex items-center gap-2 text-xl font-mono font-bold text-primary mb-2">
                      <span>{formatElapsedTime(elapsedTime)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Updating based on checklist...</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Review Message - Only show after update */}
          {updated && !isUpdating && (
            <div className={isDraftVariant 
              ? "mt-4 p-4 bg-card rounded-lg shadow-sm"
              : "flex items-start gap-3"
            }>
              {!isDraftVariant && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-primary/20 text-primary">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
              )}
              <div className={isDraftVariant ? "" : "flex-1 bg-muted rounded-lg p-4"}>
                <p className={`text-sm ${isDraftVariant ? 'text-muted-foreground' : 'text-foreground'}`}>
                  {updatedMessage}
                </p>
              </div>
            </div>
          )}

          {isGeneratingChecklist && (
            <div className={isDraftVariant 
              ? "flex items-center gap-2 text-sm text-muted-foreground"
              : "flex items-center gap-3"
            }>
              {!isDraftVariant && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
                  <Edit className="h-4 w-4" />
                </div>
              )}
              <div className={`flex items-center gap-2 text-sm text-muted-foreground ${isDraftVariant ? '' : 'bg-muted rounded-lg p-3'}`}>
                
                <span>Generating checklist...</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>
      </div>
    </div>
  );
};

