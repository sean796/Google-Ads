import { Download } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { buildAgentPanelRows } from "@/lib/platform-data/agent-panel";
import { downloadAgentArtifact } from "@/lib/platform-data/research-download";
import type { PlatformDataResearchMeta } from "@/lib/platform-data/types";
import { Button } from "@/ui";

type PulseAssistAgentsAccordionProps = {
  meta: PlatformDataResearchMeta;
};

export function PulseAssistAgentsAccordion({ meta }: PulseAssistAgentsAccordionProps) {
  const rows = buildAgentPanelRows(meta);
  if (rows.length === 0) return null;

  return (
    <Accordion type="single" collapsible className="pulse-assist-agents">
      <AccordionItem value="agents" className="pulse-assist-agents__item">
        <AccordionTrigger className="pulse-assist-agents__trigger text-base py-2 hover:no-underline">
          Agents
        </AccordionTrigger>
        <AccordionContent className="pulse-assist-agents__content text-base pb-2 pt-0">
          <ul className="pulse-assist-agents__list">
            {rows.map((row) => (
              <li key={row.id} className="pulse-assist-agents__row">
                <span className="pulse-assist-agents__row-label">{row.label}</span>
                <Button
                  size="icon" icon={Download}
                  variant="quiet"
                  aria-label={`Download ${row.label} JSON`}
                  onClick={() => downloadAgentArtifact(row.downloadName, row.downloadPayload)}
                ></Button>
              </li>
            ))}
          </ul>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
