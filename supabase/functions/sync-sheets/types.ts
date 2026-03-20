export interface CampaignRow {
  date: string | null;
  campaign: string;
  insertion_order: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  conversions: number;
  conv_value: number;
  ctr: number;
  cpm: number;
  cpc: number;
  cpa: number;
}

export interface GA4Row {
  product: string;
  leads: number;
  sessions: number;
  users: number;
}

export interface SheetLink {
  client_id: string;
  platform: string;
  sheet_url: string;
}

export interface SyncResult {
  clientId: string;
  platform: string;
  status: "ok" | "error";
  rows?: number;
  months?: string[];
  error?: string;
}
