/**
 * Demo contracts mirroring apps/api/demo/contracts.py exactly.
 *
 * Offsets in citations are Unicode code-point offsets into canonical page text,
 * not JavaScript UTF-16 indices. The browser always renders the returned quote.
 */

export type MetadataStatus = 'found' | 'unknown' | 'ambiguous';
export type FindingKind = 'relevant_excerpt' | 'not_found';
export type ExplanationMode = 'deterministic' | 'external_model';
export type InboxRecipient = 'simulated_mechanic' | 'simulated_officer';
export type InboxName = 'mechanic' | 'officer';

export interface PageText {
  page: number;
  text: string;
  readable: boolean;
}

export interface Citation {
  page: number;
  start: number;
  end: number;
  quote: string;
}

export interface MetadataField {
  value: string | null;
  status: MetadataStatus;
  citations: Citation[];
}

export interface DocumentSummary {
  id: string;
  revision: number;
  filename: string;
  page_count: number;
  unreadable_pages: number[];
  metadata: Record<string, MetadataField>;
}

export interface Finding {
  kind: FindingKind;
  text: string;
  citations: Citation[];
}

export interface Explanation {
  id: string;
  document_id: string;
  document_revision: number;
  mode: ExplanationMode;
  narrative: string;
  findings: Finding[];
  limitations: string[];
  created_at: string;
}

export interface InboxEntry {
  id: string;
  recipient: InboxRecipient;
  title: string;
  narrative: string;
  citations: Citation[];
}

export interface Handoff {
  id: string;
  explanation_id: string;
  simulated: true;
  status: 'simulated_created';
  mechanic: InboxEntry;
  officer: InboxEntry;
  created_at: string;
}

export interface InboxResponse {
  simulated: true;
  entries: InboxEntry[];
}

export interface SessionCreated {
  expires_at: string;
  csrf_token: string;
  mode: 'deterministic';
}

export interface SessionView {
  expires_at: string;
  mode: 'deterministic';
  csrf_token: string;
  document: DocumentSummary | null;
}

export interface ErrorEnvelope {
  error: { code: string; message: string; request_id: string };
}

export const SIMULATION_WARNING =
  'Simulation only — no claim has been filed and no mechanic or insurer has been contacted. This is not a coverage decision.';

export const DETERMINISTIC_MODE_LABEL = 'Document excerpts — deterministic, not AI-generated.';

export const HANDOFF_BUTTON_LABEL = 'Create simulated handoff';

export const NOT_FOUND_TEXT =
  'No matching clause found in the readable pages. This does not establish coverage or exclusion.';

export const UNKNOWN_METADATA_DISPLAY = 'Not found in readable policy text';

export const AMBIGUOUS_METADATA_DISPLAY = 'Conflicting values — review cited pages';

export const METADATA_FIELD_LABELS: Record<string, string> = {
  insurer_name: 'Insurer name',
  policy_number: 'Policy number',
  vehicle_registration: 'Vehicle registration',
  vehicle_year: 'Vehicle year',
  premium: 'Premium',
  insured_value: 'Insured value',
  start_date: 'Start date',
  end_date: 'End date',
};

export const METADATA_FIELD_ORDER = Object.keys(METADATA_FIELD_LABELS);
