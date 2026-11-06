import { GoogleAdsCountedInputShell } from "@/components/ppc/google/GoogleAdsFieldCount";
import { PpcInlineField } from "@/components/ppc/google/PpcInlineField";
import { PPC_DETAIL_INPUT_CLASS } from "@/components/ppc/google/google-ads-row-details-styles";
import { cn } from "@/lib/utils";
import { Input } from "@/ui";

export function PpcCountedInputField({
  label,
  value,
  max,
  readOnly = false,
  onChange,
  inputId,
}: {
  label: string;
  value: string;
  max: number;
  readOnly?: boolean;
  onChange?: (value: string) => void;
  inputId?: string;
}) {
  const padClass = max >= 1000 ? "pr-16" : "pr-12";

  return (
    <PpcInlineField label={label}>
      <GoogleAdsCountedInputShell value={value} max={max}>
        <Input
          id={inputId}
          value={value}
          readOnly={readOnly}
          className={cn(PPC_DETAIL_INPUT_CLASS, padClass)}
          onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        />
      </GoogleAdsCountedInputShell>
    </PpcInlineField>
  );
}
