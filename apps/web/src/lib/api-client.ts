/**
 * Typed API client for the CoverAI backend.
 *
 * All backend calls go through the axios instance below. Requests carry
 * credentials (HttpOnly auth cookies) so the API trusts the browser session.
 */
import axios from 'axios';
import type { AxiosProgressEvent } from 'axios';

export type {
  PolicyDetail,
  PolicyUploadResponse,
  BackendClaim,
  ClaimImage,
  AuditLog,
  AITriageAssessment,
  ClaimDetail,
  ClaimStatus,
  ClaimType,
  RiskLevel,
  AdvisorCustomer,
  LinkedAdvisor,
  ChatMessage,
  ConversationResponse,
  InsurerQueueFilters,
  ConsentRecord,
  DataExportRequest,
  DataDeletionRequest,
} from '@coverai/shared-types';

import type {
  PolicyDetail,
  PolicyUploadResponse,
  BackendClaim,
  ClaimDetail,
  ClaimStatus,
  AdvisorCustomer,
  LinkedAdvisor,
  ChatMessage,
  ConversationResponse,
  InsurerQueueFilters,
  ConsentRecord,
  DataExportRequest,
  DataDeletionRequest,
} from '@coverai/shared-types';

export interface ClaimCreateInput {
  policy_id: string;
  incident_date: string;
  incident_location: string;
  incident_description: string;
  claim_type: string;
  estimated_amount: number;
}

export interface ClaimCreateResponse {
  claim_id: string;
  claim_number: string;
  status: ClaimStatus;
}

export interface ClaimSubmitResponse {
  claim_id: string;
  status: ClaimStatus;
  message: string;
}

export interface ImageUploadResponse {
  image_id: string;
  storage_path: string;
  message: string;
}

export interface ConsentUpdateResponse {
  status: string;
  message: string;
  consent: { consent_type: string; granted: boolean };
}

export interface ExportRequestResponse {
  request_id: string;
  message: string;
}

export interface DeletionRequestResponse {
  request_id: string;
  message: string;
}

const DEFAULT_API_URL = 'http://localhost:8000/api/v1';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true, // HttpOnly access_token cookie from /auth/login
  headers: { 'Content-Type': 'application/json' },
});

// ── Policies ─────────────────────────────────────────────────────────────

export function getPolicies(): Promise<PolicyDetail[]> {
  return api.get('/policies/').then((r) => r.data);
}

export function getPolicy(policyId: string): Promise<PolicyDetail> {
  return api.get(`/policies/${policyId}`).then((r) => r.data);
}

export function uploadPolicy(
  file: File,
  vehicleReg: string,
  insurerName: string,
  onUploadProgress?: (event: AxiosProgressEvent) => void
): Promise<PolicyUploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('vehicle_registration', vehicleReg);
  form.append('insurer_name', insurerName);
  return api
    .post('/policies/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    })
    .then((r) => r.data);
}

// ── Claims ───────────────────────────────────────────────────────────────

export function getClaims(status?: ClaimStatus): Promise<BackendClaim[]> {
  return api.get('/claims/', { params: status ? { status } : {} }).then((r) => r.data);
}

export function getClaim(claimId: string): Promise<ClaimDetail> {
  return api.get(`/claims/${claimId}`).then((r) => r.data);
}

export function createClaim(input: ClaimCreateInput): Promise<ClaimCreateResponse> {
  return api.post('/claims/', input).then((r) => r.data);
}

export function uploadClaimImages(claimId: string, files: File[]): Promise<ImageUploadResponse[]> {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  return api
    .post(`/claims/${claimId}/images`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
}

export function submitClaim(claimId: string): Promise<ClaimSubmitResponse> {
  return api.post(`/claims/${claimId}/submit`).then((r) => r.data);
}

export function selfAssignClaim(claimId: string): Promise<BackendClaim> {
  return api.post(`/claims/${claimId}/assign-self`).then((r) => r.data);
}

export function patchClaimStatus(
  claimId: string,
  data: { status: ClaimStatus; remarks: string; approved_amount?: number }
): Promise<BackendClaim> {
  return api.patch(`/claims/${claimId}/status`, data).then((r) => r.data);
}

export function getInsurerClaimsQueue(filters: InsurerQueueFilters = {}): Promise<BackendClaim[]> {
  return api
    .get('/claims/', {
      params: {
        status: filters.status,
        claim_type: filters.claim_type,
        risk_level: filters.risk_level,
        date_from: filters.date_from,
        date_to: filters.date_to,
        page: filters.page ?? 1,
        limit: filters.limit ?? 25,
      },
    })
    .then((r) => r.data);
}

export function getSystemAuditLogs(opts: {
  search?: string;
  action?: string;
  page?: number;
  limit?: number;
}): Promise<import('@coverai/shared-types').AuditLog[]> {
  return api.get('/admin/audit-logs', { params: opts }).then((r) => r.data);
}

// ── Advisors ─────────────────────────────────────────────────────────────

export function getAdvisorCustomers(): Promise<AdvisorCustomer[]> {
  return api.get('/advisors/my-customers').then((r) => r.data);
}

export function getAdvisorCustomerPolicies(customerId: string): Promise<PolicyDetail[]> {
  return api.get(`/advisors/my-customers/${customerId}/policies`).then((r) => r.data);
}

export function getAdvisorCustomerClaims(customerId: string): Promise<BackendClaim[]> {
  return api.get(`/advisors/my-customers/${customerId}/claims`).then((r) => r.data);
}

export function getMyAdvisors(): Promise<LinkedAdvisor[]> {
  return api.get('/advisors/my-advisors').then((r) => r.data);
}

export function createAdvisorAssignment(email: string): Promise<{
  assignment_id: string;
  advisor_name: string;
  advisor_email: string;
}> {
  return api.post('/advisors/assignments', { advisor_email: email }).then((r) => r.data);
}

export function deleteAdvisorAssignment(assignmentId: string): Promise<{ message: string }> {
  return api.delete(`/advisors/assignments/${assignmentId}`).then((r) => r.data);
}

// ── Conversations (Q&A co-pilot) ─────────────────────────────────────────

export function createConversation(policyId: string): Promise<ConversationResponse> {
  return api.post('/conversations', { policy_id: policyId }).then((r) => r.data);
}

export function getPolicyConversation(policyId: string): Promise<ConversationResponse> {
  return api.get(`/conversations/policy/${policyId}`).then((r) => r.data);
}

export function getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  return api.get(`/conversations/${conversationId}/messages`).then((r) => r.data);
}

// ── DPDP Consent & Data Rights ───────────────────────────────────────────

export function getConsentRecords(): Promise<ConsentRecord[]> {
  return api.get('/consent/').then((r) => r.data);
}

export function updateConsentRecord(consentType: string, granted: boolean): Promise<ConsentUpdateResponse> {
  return api.patch(`/consent/${consentType}`, { granted }).then((r) => r.data);
}

export function requestDataExport(): Promise<ExportRequestResponse> {
  return api.post('/consent/data-export-request').then((r) => r.data);
}

export function requestDataDeletion(): Promise<DeletionRequestResponse> {
  return api.post('/consent/data-deletion-request').then((r) => r.data);
}

export function cancelDataDeletion(): Promise<{ status: string; message: string }> {
  return api.post('/consent/data-deletion-request/cancel').then((r) => r.data);
}

export function getDataExportRequests(): Promise<DataExportRequest[]> {
  return api.get('/consent/data-export-requests').then((r) => r.data);
}

export function getDataDeletionRequests(): Promise<DataDeletionRequest[]> {
  return api.get('/consent/data-deletion-requests').then((r) => r.data);
}
