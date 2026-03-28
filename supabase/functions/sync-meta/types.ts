export interface MetaConfig {
  id: number;
  client_id: string;
  account_id: string;
  enabled: boolean;
  last_synced_at: string | null;
}

export interface MetaInsightRow {
  campaign_name: string;
  date_start: string; // YYYY-MM-DD
  impressions: string;
  clicks: string;
  spend: string;
  reach: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

export interface CampaignRow {
  date: string;       // YYYY-MM-DD
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

export interface SyncResult {
  clientId: string;
  platform: string;
  status: "ok" | "error";
  rows?: number;
  months?: string[];
  error?: string;
}

export interface TokenInfo {
  valid: boolean;
  expiresAt: Date | null;
  daysLeft: number | null;
  error?: string;
}
