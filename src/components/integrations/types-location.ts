export interface Location {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  /** United States or Canada when set from Profile country select. */
  country?: string;
  zip: string;
  phone: string;
  email?: string;
  isDefault: boolean;
}

export interface NAPInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  locations?: Location[];
}
