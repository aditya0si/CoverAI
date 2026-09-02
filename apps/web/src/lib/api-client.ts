import axios from 'axios';
import type {
  AdvisorCustomer,
  AITriageAssessment,
  AuditLog,
  BackendClaim,
  ChatMessage,
  ClaimCreateInput,
  ClaimCreateResponse,
  ClaimDetail,
  ClaimImage,
  ClaimStatus,
  ClaimSubmitResponse,
  ClaimType,
  ConsentRecord,
  ConversationResponse,
  DataDeletionRequest,
  DataExportRequest,
  ImageUploadResponse,
  InsurerQueueFilters,
  LinkedAdvisor,
  PolicyDetail,
  PolicyUploadResponse,
  RiskLevel,
} from '@coverai/shared-types';

export type {
  AdvisorCustomer,
  AITriageAssessment,
  AuditLog,
  BackendClaim,
  ChatMessage,
  ClaimDetail,
  ClaimImage,
  ClaimStatus,
  ClaimType,
  ConsentRecord,
  ConversationResponse,
  DataDeletionRequest,
  DataExportRequest,
  ImageUploadResponse,
  InsurerQueueFilters,
  LinkedAdvisor,
  PolicyDetail,
  PolicyUploadResponse,
  RiskLevel,
};

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Cookie-based auth: access/refresh tokens are HttpOnly cookies set by the API.
export const client = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

function toQuery(params?: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') {
      search.set(key, String(value));
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

// ── Policies ──────────────────────────────────────────────────────────────

export async function getPolicies(): Promise<PolicyDetail[]> {
  const { data } = await client.get<PolicyDetail[]>('/policies');
  return data;
}

export async function getPolicy(policyId: string): Promise<PolicyDetail> {
  const { data } = await client.get<PolicyDetail>(`/policies/${policyId}`);
  return data;
}

export async function uploadPolicy(
  file: File,
  vehicleRegistration: string,
  insurerName: string,
  onProgress?: (percent: number) => void
): Promise<PolicyUploadResponse> {
  const form = new FormData();
  form.append('file', file);
  form.append('vehicle_registration', vehicleRegistration);
  form.append('insurer_name', insurerName);

  const { data } = await client.post<PolicyUploadResponse>('/policies/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded * 100) / event.total));
      }
    },
  });
  return data;
}

// ── Conversations ─────────────────────────────────────────────────────────

export async function getPolicyConversation(policyId: string): Promise<ConversationResponse> {
  const { data } = await client.get<ConversationResponse>(`/conversations/policy/${policyId}`);
  return data;
}

export async function createConversation(policyId: string): Promise<ConversationResponse> {
  const { data } = await client.post<ConversationResponse>('/conversations', { policy_id: policyId });
  return data;
}

export async function getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const { data } = await client.get<ChatMessage[]>(`/conversations/${conversationId}/messages`);
  return data;
}

// ── Claims ────────────────────────────────────────────────────────────────

export async function getClaim(claimId: string): Promise<ClaimDetail> {
  const { data } = await client.get<ClaimDetail>(`/claims/${claimId}`);
  return data;
}

export async function getClaims(status?: ClaimStatus): Promise<ClaimDetail[]> {
  const { data } = await client.get<ClaimDetail[]>(`/claims${toQuery(status ? { status } : undefined)}`);
  return data;
}

export async function createClaim(input: ClaimCreateInput): Promise<ClaimCreateResponse> {
  const { data } = await client.post<ClaimCreateResponse>('/claims', input);
  return data;
}

export async function uploadClaimImages(claimId: string, files: File[]): Promise<ImageUploadResponse[]> {
  const form = new FormData();
  files.forEach((file) => form.append('files', file));

  const { data } = await client.post<ImageUploadResponse[]>(`/claims/${claimId}/images`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function submitClaim(claimId: string): Promise<ClaimSubmitResponse> {
  const { data } = await client.post<ClaimSubmitResponse>(`/claims/${claimId}/submit`);
  return data;
}

export async function getInsurerClaimsQueue(filters?: InsurerQueueFilters): Promise<BackendClaim[]> {
  const { data } = await client.get<BackendClaim[]>(
    `/claims/queue${toQuery(filters as Record<string, unknown> | undefined)}`
  );
  return data;
}

export async function patchClaimStatus(
  claimId: string,
  input: { status: ClaimStatus; remarks: string; approved_amount?: number }
): Promise<ClaimDetail> {
  const { data } = await client.patch<ClaimDetail>(`/claims/${claimId}/status`, input);
  return data;
}

export async function selfAssignClaim(claimId: string): Promise<ClaimDetail> {
  const { data } = await client.post<ClaimDetail>(`/claims/${claimId}/assign`);
  return data;
}

// ── Advisors ──────────────────────────────────────────────────────────────

export async function getAdvisorCustomers(): Promise<AdvisorCustomer[]> {
  const { data } = await client.get<AdvisorCustomer[]>('/advisors/my-customers');
  return data;
}

export async function getAdvisorCustomerPolicies(customerId: string): Promise<PolicyDetail[]> {
  const { data } = await client.get<PolicyDetail[]>(`/advisors/my-customers/${customerId}/policies`);
  return data;
}

export async function getAdvisorCustomerClaims(customerId: string): Promise<ClaimDetail[]> {
  const { data } = await client.get<ClaimDetail[]>(`/advisors/my-customers/${customerId}/claims`);
  return data;
}

export async function getMyAdvisors(): Promise<LinkedAdvisor[]> {
  const { data } = await client.get<LinkedAdvisor[]>('/advisors/my-advisors');
  return data;
}

export async function createAdvisorAssignment(advisorEmail: string): Promise<LinkedAdvisor> {
  const { data } = await client.post<LinkedAdvisor>('/advisors/assignments', { advisor_email: advisorEmail });
  return data;
}

export async function deleteAdvisorAssignment(assignmentId: string): Promise<void> {
  await client.delete(`/advisors/assignments/${assignmentId}`);
}

// ── Admin / Audit Logs ────────────────────────────────────────────────────

export async function getSystemAuditLogs(params?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<AuditLog[]> {
  const { data } = await client.get<AuditLog[]>(`/admin/audit-logs${toQuery(params ?? {})}`);
  return data;
}

// ── DPDP Consent & Data Rights ────────────────────────────────────────────

export async function getConsentRecords(): Promise<ConsentRecord[]> {
  const { data } = await client.get<ConsentRecord[]>('/consent/');
  return data;
}

export async function updateConsentRecord(
  consentType: string,
  granted: boolean
): Promise<{ status: string; message: string; consent: { consent_type: string; granted: boolean } }> {
  const { data } = await client.patch(`/consent/${consentType}`, { granted });
  return data;
}

export async function requestDataExport(): Promise<{ request_id: string; message: string }> {
  const { data } = await client.post('/consent/data-export-request');
  return data;
}

export async function getDataExportRequests(): Promise<DataExportRequest[]> {
  const { data } = await client.get<DataExportRequest[]>('/consent/data-export-requests');
  return data;
}

export async function requestDataDeletion(): Promise<{ request_id: string; message: string }> {
  const { data } = await client.post('/consent/data-deletion-request');
  return data;
}

export async function getDataDeletionRequests(): Promise<DataDeletionRequest[]> {
  const { data } = await client.get<DataDeletionRequest[]>('/consent/data-deletion-requests');
  return data;
}

export async function cancelDataDeletion(): Promise<{ status: string; message: string }> {
  const { data } = await client.post('/consent/data-deletion-request/cancel');
  return data;
}
