export interface ACFLocationRule {
  param: string;
  operator: string;
  value: string;
}

export interface ACFFieldDefinition {
  name: string;
  label: string;
  type: string;
  groupId?: number;
  groupTitle?: string;
  location?: ACFLocationRule[][];
  sampleValue?: unknown;
  occurrenceCount?: number;
}

export interface ACFFieldGroup {
  id: number;
  title: string;
  fields: ACFFieldDefinition[];
  location: ACFLocationRule[][];
}

export interface PostFieldsDiscoveryResult {
  success: boolean;
  fieldGroups: ACFFieldGroup[];
  fields: ACFFieldDefinition[];
  method: 'acf_rest_api' | 'sample_scan' | 'neo_pulse_fields_export' | null;
  error?: string;
}

export interface WpPostSnapshotFromFieldsByUrl {
  id: number;
  slug: string;
  title: string;
  content: string;
  excerpt: string;
  date_gmt: string;
  status: string;
  link: string;
  postTypeEndpoint: string;
  postTypeSubtype: string;
}
export type AcfBatchUrlItem = { url: string; postTypeEndpointHint?: string };
export type AcfBatchPostItem = {
  postId: number;
  postType?: string;
  postTypeEndpoint?: string;
};
