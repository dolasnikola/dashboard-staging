export interface GemiusConfig {
  id: number;
  client_id: string;
  gde_client_name: string;
  gde_campaign_ids: string[];
  enabled: boolean;
}

export interface GdeCampaign {
  campaignID: string;
  name: string;
  clientName: string;
  clientID: string;
  status: string;
}

export interface PlacementStats {
  campaignName: string;
  placementFullName: string;
  period: string; // YYYYMMDD000000
  impressions: number;
  clicks: number;
  ctr: number;
  actions: number;
}

export interface LocalDisplayRow {
  client_id: string;
  campaign: string;
  publisher: string;
  format: string;
  type: string;
  date: string; // YYYY-MM-DD
  impressions: number;
  clicks: number;
  ctr: number;
  actions: number;
  spend: number;
}

export interface SyncResult {
  clientId: string;
  platform: string;
  status: "ok" | "error";
  rows?: number;
  months?: string[];
  error?: string;
}
