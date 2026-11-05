import { useEffect, useRef, useState, type ReactElement } from "react";
import { cn } from "@/lib/utils";
import { TASK_FORM_DIALOG_BUTTON_CLASS } from "@/components/manager/tasks/TaskFormLayout";
import { Button } from "@/ui";

const CLICKED_MS = 500;

export function SavePropertyButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}): ReactElement {
  const [clicked, setClicked] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <Button
      type="button"
      aria-pressed={clicked}
      onClick={() => {
        setClicked(true);
        onClick();
        if (timerRef.current != null) window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setClicked(false), CLICKED_MS);
      }}
    >
      Save Property
    </Button>
  );
}
