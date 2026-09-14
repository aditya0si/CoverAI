'use client';

import { api } from '@/lib/auth';
import type {
  PolicyDetail,
  PolicyUploadResponse,
  BackendClaim,
  ClaimDetail,
  ClaimCreateInput,
  ClaimCreateResponse,
  ClaimSubmitResponse,
  ClaimImage,
  ClaimStatus,
  ClaimType,
  RiskLevel,
  InsurerQueueFilters,
  AITriageAssessment,
  AuditLog,
  ChatMessage,
  ConversationResponse,
  AdvisorCustomer,
  LinkedAdvisor,
  ConsentRecord,
  DataExportRequest,
  DataDeletionRequest,
} from '@coverai/shared-types';

// Re-exported so pages import domain types from a single module.
export type {
  PolicyDetail,
  BackendClaim,
  ClaimDetail,
  ClaimImage,
  ClaimStatus,
  ClaimType,
  RiskLevel,
  InsurerQueueFilters,
  AITriageAssessment,
  AuditLog,
  ChatMessage,
  AdvisorCustomer,
  LinkedAdvisor,
  ConsentRecord,
  DataExportRequest,
  DataDeletionRequest,
};

// ── Policies ────────────────────────────────────────────────────────────────

export const getPolicies = (): Promise<PolicyDetail[]> =>
  api.get('/policies').then((r) => r.data);

export const getPolicy = (id: string): Promise<PolicyDetail> =>
  api.get(`/policies/${id}`).then((r) => r.data);

export const uploadPolicy = (
  file: File,
  vehicleReg: string,
  insurerName: string,
  onProgress?: (event: { loaded: number; total?: number }) => void
): Promise<PolicyUploadResponse> => {
  const form = new FormData();
  form.append('file', file);
  form.append('vehicle_registration', vehicleReg);
  form.append('insurer_name', insurerName);
  return api
    .post('/policies/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress({ loaded: event.loaded, total: event.total });
        }
      },
    })
    .then((r) => r.data);
};

// ── Claims ──────────────────────────────────────────────────────────────────

export const getClaims = (status?: string): Promise<BackendClaim[]> =>
  api.get('/claims', { params: status ? { status } : undefined }).then((r) => r.data);

export const getClaim = (id: string): Promise<ClaimDetail> =>
  api.get(`/claims/${id}`).then((r) => r.data);

export const createClaim = (input: ClaimCreateInput): Promise<ClaimCreateResponse> =>
  api.post('/claims', input).then((r) => r.data);

export const submitClaim = (id: string): Promise<ClaimSubmitResponse> =>
  api.post(`/claims/${id}/submit`).then((r) => r.data);

export const uploadClaimImages = (claimId: string, files: File[]): Promise<unknown> => {
  const form = new FormData();
  files.forEach((f) => form.append('files', f));
  return api
    .post(`/claims/${claimId}/images`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};

// ── Conversations (AI co-pilot) ─────────────────────────────────────────────

export const getPolicyConversation = (policyId: string): Promise<ConversationResponse> =>
  api.get(`/conversations/policy/${policyId}`).then((r) => r.data);

export const createConversation = (policyId: string): Promise<ConversationResponse> =>
  api.post('/conversations', { policy_id: policyId }).then((r) => r.data);

export const getConversationMessages = (conversationId: string): Promise<ChatMessage[]> =>
  api.get(`/conversations/${conversationId}/messages`).then((r) => r.data);

// ── Advisors ────────────────────────────────────────────────────────────────

export const getAdvisorCustomers = (): Promise<AdvisorCustomer[]> =>
  api.get('/advisors/my-customers').then((r) => r.data);

export const getAdvisorCustomerPolicies = (customerId: string): Promise<PolicyDetail[]> =>
  api.get(`/advisors/my-customers/${customerId}/policies`).then((r) => r.data);

export const getAdvisorCustomerClaims = (customerId: string): Promise<BackendClaim[]> =>
  api.get(`/advisors/my-customers/${customerId}/claims`).then((r) => r.data);

export const getMyAdvisors = (): Promise<LinkedAdvisor[]> =>
  api.get('/advisors/my-advisors').then((r) => r.data);

export const createAdvisorAssignment = (advisorEmail: string): Promise<Pick<LinkedAdvisor, 'assignment_id' | 'advisor_name' | 'advisor_email'>> =>
  api.post('/advisors/assignments', { advisor_email: advisorEmail }).then((r) => r.data);

export const deleteAdvisorAssignment = (assignmentId: string): Promise<{ message: string }> =>
  api.delete(`/advisors/assignments/${assignmentId}`).then((r) => r.data);

// ── Insurer claim queue / review ────────────────────────────────────────────

export const getInsurerClaimsQueue = (
  filters?: InsurerQueueFilters
): Promise<BackendClaim[]> =>
  api.get('/insurer/claims', { params: filters }).then((r) => r.data);

export const selfAssignClaim = (claimId: string): Promise<{
  claim_id: string;
  claim_number: string;
  assigned_officer_id: string;
  status: ClaimStatus;
  message: string;
}> => api.post(`/insurer/claims/${claimId}/assign`).then((r) => r.data);

export const patchClaimStatus = (
  claimId: string,
  body: { status: ClaimStatus; remarks: string; approved_amount?: number }
): Promise<{ claim_id: string; status: ClaimStatus; message: string }> =>
  api.patch(`/insurer/claims/${claimId}/status`, body).then((r) => r.data);

export const getSystemAuditLogs = (params?: {
  search?: string;
  action?: string;
  resource_type?: string;
  page?: number;
  limit?: number;
}): Promise<AuditLog[]> => api.get('/admin/audit-logs', { params }).then((r) => r.data);

// ── DPDP consent & data rights ──────────────────────────────────────────────

export const getConsentRecords = (): Promise<ConsentRecord[]> =>
  api.get('/consent/').then((r) => r.data);

export const updateConsentRecord = (
  consentType: string,
  granted: boolean
): Promise<{ status: string; message: string }> =>
  api.patch(`/consent/${consentType}`, { granted }).then((r) => r.data);

export const requestDataExport = (): Promise<{ request_id: string; message: string }> =>
  api.post('/consent/data-export-request').then((r) => r.data);

export const requestDataDeletion = (): Promise<{ request_id: string; message: string }> =>
  api.post('/consent/data-deletion-request').then((r) => r.data);

export const cancelDataDeletion = (): Promise<{ status: string; message: string }> =>
  api.post('/consent/data-deletion-request/cancel').then((r) => r.data);

export const getDataExportRequests = (): Promise<DataExportRequest[]> =>
  api.get('/consent/data-export-requests').then((r) => r.data);

export const getDataDeletionRequests = (): Promise<DataDeletionRequest[]> =>
  api.get('/consent/data-deletion-requests').then((r) => r.data);
