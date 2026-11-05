import type { ReactNode } from "react";

export type FormSectionProps = {
  /** Related fields (`Field`, `SelectField`). One row, wrapping only when the panel is narrow. */
  children: ReactNode;
  /** Primary and secondary actions (`Button`, `ActionButton`). */
  actions: ReactNode;
};

/** Flat form block: fields first, one action row below. Labels live inside the fields. */
export function FormSection({ children, actions }: FormSectionProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">{children}</div>
      <div className="flex items-center justify-end gap-1.5">{actions}</div>
    </div>
  );
}
