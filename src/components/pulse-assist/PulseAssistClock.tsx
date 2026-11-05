import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { formatEdmontonCalendarTooltip } from "@/lib/edmonton-time";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";

type PulseAssistClockProps = {
  className?: string;
};

export function PulseAssistClock({ className }: PulseAssistClockProps) {
  const [tooltip, setTooltip] = useState(() => formatEdmontonCalendarTooltip());

  useEffect(() => {
    setTooltip(formatEdmontonCalendarTooltip());
    const id = window.setInterval(() => setTooltip(formatEdmontonCalendarTooltip()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon" icon={Clock}
          variant="quiet"
          aria-label={tooltip}
        ></Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-none text-base">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}
