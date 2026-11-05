
import { usStates, canadianProvinces } from "@/lib/keyword-location-utils";
import { Field, SelectField } from "@/ui";

interface LocationSelectorProps {
  country: "United States" | "Canada";
  stateProvince: string;
  city: string;
  onCountryChange: (value: "United States" | "Canada") => void;
  onStateProvinceChange: (value: string) => void;
  onCityChange: (value: string) => void;
}

export function LocationSelector({
  country,
  stateProvince,
  city,
  onCountryChange,
  onStateProvinceChange,
  onCityChange,
}: LocationSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-2">
        
        <SelectField placeholder="Country" value={country} onValueChange={(value) => {
            onCountryChange(value as "United States" | "Canada");
            onStateProvinceChange(""); // Reset state/province when country changes
            onCityChange(""); // Reset city when country changes
          }} options={[{ value: "United States", label: "United States" }, { value: "Canada", label: "Canada" }]} />
      </div>
      <div className="space-y-2">
        <label>{country === "United States" ? "State" : "Province"}</label>
        <SelectField
          placeholder={`Select ${country === "United States" ? "state" : "province"}`}
          value={stateProvince || "__all__"}
          onValueChange={(value) => {
            onStateProvinceChange(value === "__all__" ? "" : value);
            // Don't reset city when state changes
          }}
          options={[
            { value: "__all__", label: `All ${country === "United States" ? "States" : "Provinces"}` },
            ...(country === "United States" ? usStates : canadianProvinces).map((item) => ({ value: item, label: item })),
          ]}
          width="full"
        />
      </div>
      <div className="space-y-2">
        <label>City (Optional)</label>
        <Field
          type="text"
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          placeholder="e.g., Los Angeles, Toronto"
        />
      </div>
    </div>
  );
}

