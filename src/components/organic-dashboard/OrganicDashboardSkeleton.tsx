export function OrganicDashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-4 bg-ui-field/80 p-4">
        <div className="h-5 w-32 bg-ui-field-hover" />
        <div className="h-4 w-full max-w-md bg-ui-field-hover" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-8 w-full bg-ui-field-hover" />
          ))}
        </div>
      </div>
      <div className="space-y-4 bg-ui-field/80 p-4">
        <div className="h-5 w-48 bg-ui-field-hover" />
        <div className="h-56 w-full bg-ui-field-hover" />
      </div>
      <div className="space-y-4 bg-ui-field/80 p-4">
        <div className="h-5 w-40 bg-ui-field-hover" />
        <div className="h-56 w-full bg-ui-field-hover" />
      </div>
    </div>
  );
}
