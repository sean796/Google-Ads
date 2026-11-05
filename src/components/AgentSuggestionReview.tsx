import React, { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, X, Check, XCircle } from "lucide-react";
import type { AgentConfig } from "@/types/agent-config";
import { Button } from "@/ui";

interface AgentSuggestionReviewProps {
  suggestedAgents: AgentConfig[];
  onAccept: (agent: AgentConfig) => void;
  onReject: (agentId: string) => void;
  onAcceptAll: (agents: AgentConfig[]) => void;
  onCancel: () => void;
}

export const AgentSuggestionReview: React.FC<AgentSuggestionReviewProps> = ({
  suggestedAgents,
  onAccept,
  onReject,
  onAcceptAll,
  onCancel,
}) => {
  const [acceptedIds, setAcceptedIds] = useState<Set<string>>(new Set());
  const [rejectedIds, setRejectedIds] = useState<Set<string>>(new Set());

  const handleAccept = (agent: AgentConfig) => {
    setAcceptedIds((prev) => new Set(prev).add(agent.id));
    setRejectedIds((prev) => {
      const next = new Set(prev);
      next.delete(agent.id);
      return next;
    });
    onAccept(agent);
  };

  const handleReject = (agentId: string) => {
    setRejectedIds((prev) => new Set(prev).add(agentId));
    setAcceptedIds((prev) => {
      const next = new Set(prev);
      next.delete(agentId);
      return next;
    });
    onReject(agentId);
  };

  const handleAcceptAll = () => {
    const toAccept = suggestedAgents.filter(
      (agent) => !rejectedIds.has(agent.id)
    );
    toAccept.forEach((agent) => {
      if (!acceptedIds.has(agent.id)) {
        handleAccept(agent);
      }
    });
    onAcceptAll(toAccept);
  };

  const acceptedAgents = suggestedAgents.filter((agent) =>
    acceptedIds.has(agent.id)
  );
  const pendingAgents = suggestedAgents.filter(
    (agent) => !acceptedIds.has(agent.id) && !rejectedIds.has(agent.id)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Review Suggested Agents</h3>
          <p className="text-sm text-muted-foreground">
            {suggestedAgents.length} agents suggested • {acceptedAgents.length}{" "}
            accepted • {pendingAgents.length} pending
          </p>
        </div>
        <div className="flex gap-2">
          {pendingAgents.length > 0 && (
            <Button
              variant="run"
              onClick={handleAcceptAll}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Accept All Pending
            </Button>
          )}
          <Button onClick={onCancel}>
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {suggestedAgents.map((agent) => {
          const isAccepted = acceptedIds.has(agent.id);
          const isRejected = rejectedIds.has(agent.id);

          return (
            <Card
              key={agent.id}
              className={`p-4 border-2 transition-all ${
                isAccepted
                  ? "border-primary bg-primary/80 dark:bg-primary/20"
                  : isRejected
                  ? "border-ui-danger-edge bg-ui-danger/20 dark:bg-ui-danger-surface/20 opacity-60"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-base">{agent.title}</h4>
                    <Badge variant="outline" className="text-xs">
                      Step {agent.step}
                    </Badge>
                    {isAccepted && (
                      <Badge className="bg-primary/80 text-white text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Accepted
                      </Badge>
                    )}
                    {isRejected && (
                      <Badge variant="destructive" className="text-xs">
                        <XCircle className="h-3 w-3 mr-1" />
                        Rejected
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {agent.description}
                  </p>
                  {agent.features && agent.features.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">
                        Features:
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {agent.features.map((feature, idx) => (
                          <Badge
                            key={idx}
                            variant="secondary"
                            className="text-xs"
                          >
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-4 text-xs text-muted-foreground">
                    <span>H2: {agent.h2Count || 1}</span>
                    {agent.h3Enabled && (
                      <span>H3: {agent.h3Count || 0}</span>
                    )}
                    <span>Tokens: {agent.maxTokens || 2000}</span>
                  </div>
                </div>
                {!isAccepted && !isRejected && (
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleAccept(agent)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button
                      onClick={() => handleReject(agent.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
                {isAccepted && (
                  <Button
                    variant="quiet"
                    onClick={() => handleReject(agent.id)}
                  >
                    Undo
                  </Button>
                )}
                {isRejected && (
                  <Button
                    variant="quiet"
                    onClick={() => handleAccept(agent)}
                  >
                    Undo
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {acceptedAgents.length > 0 && (
        <Card variant="neonFlat" className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-sm">
                {acceptedAgents.length} agent{acceptedAgents.length !== 1 ? "s" : ""}{" "}
                accepted
              </p>
              <p className="text-xs text-muted-foreground">
                These agents will be added to your blueprint
              </p>
            </div>
            <Button
              variant="run"
              onClick={() => onAcceptAll(acceptedAgents)}
            >
              Add to Blueprint
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
};

