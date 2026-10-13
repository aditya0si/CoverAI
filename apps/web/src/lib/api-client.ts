import { api } from './auth';
import type {
  ClaimStatus,
  BackendClaim,
  PolicyStatus,
  PolicyType,
  ClaimType,
  RiskLevel,
  PolicyDetail,
  PolicyUploadResponse,
  ClaimImage,
  AuditLog,
  AITriageAssessment,
  PolicySummary,
  ClaimDetail,
  ClaimCreateInput,
  ClaimCreateResponse,
  ClaimSubmitResponse,
  ImageUploadResponse,
  ConversationResponse,
  ChatMessage,
  InsurerQueueFilters,
  AdvisorCustomer,
  ConsentRecord,
  DataExportRequest,
  DataDeletionRequest,
  LinkedAdvisor,
} from '@coverai/shared-types';

export type {
  ClaimStatus,
  BackendClaim,
  PolicyStatus,
  PolicyType,
  ClaimType,
  RiskLevel,
  PolicyDetail,
  PolicyUploadResponse,
  ClaimImage,
  AuditLog,
  AITriageAssessment,
  PolicySummary,
  ClaimDetail,
  ClaimCreateInput,
  ClaimCreateResponse,
  ClaimSubmitResponse,
  ImageUploadResponse,
  ConversationResponse,
  ChatMessage,
  InsurerQueueFilters,
  AdvisorCustomer,
  ConsentRecord,
  DataExportRequest,
  DataDeletionRequest,
  LinkedAdvisor,
};

// ==========================================
// Policies API Functions
// ==========================================

export async function getPolicies(page = 1, limit = 20): Promise<PolicyDetail[]> {
  const response = await api.get<PolicyDetail[]>('/policies', {
    params: { page, limit },
  });
  return response.data;
}

export async function getPolicy(policyId: string): Promise<PolicyDetail> {
  const response = await api.get<PolicyDetail>(`/policies/${policyId}`);
  return response.data;
}

export async function uploadPolicy(
  file: File,
  vehicleRegistration: string,
  insurerName: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUploadProgress?: (progressEvent: any) => void
): Promise<PolicyUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('vehicle_registration', vehicleRegistration);
  formData.append('insurer_name', insurerName);

  const response = await api.post<PolicyUploadResponse>('/policies/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress,
  });
  return response.data;
}

// ==========================================
// Claims API Functions
// ==========================================

export async function getClaims(
  status?: ClaimStatus,
  page = 1,
  limit = 20
): Promise<BackendClaim[]> {
  const response = await api.get<BackendClaim[]>('/claims', {
    params: { status, page, limit },
  });
  return response.data;
}

export async function getClaim(claimId: string): Promise<ClaimDetail> {
  const response = await api.get<ClaimDetail>(`/claims/${claimId}`);
  return response.data;
}

export async function createClaim(claimData: ClaimCreateInput): Promise<ClaimCreateResponse> {
  const response = await api.post<ClaimCreateResponse>('/claims', claimData);
  return response.data;
}

export async function submitClaim(claimId: string): Promise<ClaimSubmitResponse> {
  const response = await api.post<ClaimSubmitResponse>(`/claims/${claimId}/submit`);
  return response.data;
}

export async function uploadClaimImages(
  claimId: string,
  files: File | File[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUploadProgress?: (progressEvent: any) => void
): Promise<ImageUploadResponse[]> {
  const fileList = Array.isArray(files) ? files : [files];
  const results: ImageUploadResponse[] = [];
  for (const file of fileList) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await api.post<ImageUploadResponse>(`/claims/${claimId}/images`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });
    results.push(response.data);
  }
  return results;
}

export async function uploadClaimImage(
  claimId: string,
  file: File,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onUploadProgress?: (progressEvent: any) => void
): Promise<ImageUploadResponse> {
  const res = await uploadClaimImages(claimId, file, onUploadProgress);
  return res[0];
}

// ==========================================
// AI Policy Advisor (Conversations) API Functions
// ==========================================

export async function createConversation(policyId: string): Promise<ConversationResponse> {
  const response = await api.post<ConversationResponse>('/conversations', {
    policy_id: policyId,
  });
  return response.data;
}

export async function getPolicyConversation(policyId: string): Promise<ConversationResponse> {
  const response = await api.get<ConversationResponse>(`/conversations/policy/${policyId}`);
  return response.data;
}

export async function getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const response = await api.get<ChatMessage[]>(`/conversations/${conversationId}/messages`);
  return response.data;
}

// ==========================================
// Insurer Queue & Adjudication API Functions
// ==========================================

export async function getInsurerClaimsQueue(
  filters: InsurerQueueFilters = {}
): Promise<BackendClaim[]> {
  const response = await api.get<BackendClaim[]>('/insurer/claims/queue', {
    params: filters,
  });
  return response.data;
}

export async function selfAssignClaim(claimId: string): Promise<BackendClaim> {
  const response = await api.post<BackendClaim>(`/insurer/claims/${claimId}/assign-self`);
  return response.data;
}

export async function assignSurveyor(
  claimId: string,
  surveyorId: string
): Promise<{ message: string; claim_id: string; surveyor_id: string }> {
  const response = await api.post(`/insurer/claims/${claimId}/assign-surveyor`, {
    surveyor_id: surveyorId,
  });
  return response.data;
}

export async function adjudicateClaim(
  claimId: string,
  decision: {
    decision: 'approved' | 'rejected';
    approved_amount?: number;
    rejection_reason?: string;
    internal_notes?: string;
  }
): Promise<BackendClaim> {
  const response = await api.post<BackendClaim>(`/insurer/claims/${claimId}/adjudicate`, decision);
  return response.data;
}

export async function updateClaimStatus(
  claimId: string,
  transition: {
    target_status?: ClaimStatus;
    status?: ClaimStatus;
    reason?: string;
    remarks?: string;
    approved_amount?: number;
  }
): Promise<BackendClaim> {
  const payload = {
    target_status: transition.target_status || transition.status,
    reason: transition.reason || transition.remarks,
    approved_amount: transition.approved_amount,
  };
  const response = await api.patch<BackendClaim>(`/claims/${claimId}/status`, payload);
  return response.data;
}

export const patchClaimStatus = updateClaimStatus;

// ==========================================
// Advisor Portal API Functions
// ==========================================

export async function getAdvisorCustomers(): Promise<AdvisorCustomer[]> {
  const response = await api.get<AdvisorCustomer[]>('/advisors/my-customers');
  return response.data;
}

export async function getAdvisorCustomerPolicies(customerId: string): Promise<PolicyDetail[]> {
  const response = await api.get<PolicyDetail[]>(`/advisors/my-customers/${customerId}/policies`);
  return response.data;
}

export async function getAdvisorCustomerClaims(customerId: string): Promise<BackendClaim[]> {
  const response = await api.get<BackendClaim[]>(`/advisors/my-customers/${customerId}/claims`);
  return response.data;
}

// ==========================================
// DPDP Privacy & Consent API Functions
// ==========================================

export async function getConsentRecords(): Promise<ConsentRecord[]> {
  const response = await api.get<ConsentRecord[]>('/consent');
  return response.data;
}

export async function updateConsentRecord(
  consentType: string,
  granted: boolean
): Promise<{ status: string; message: string; consent: { consent_type: string; granted: boolean } }> {
  const response = await api.patch(`/consent/${consentType}`, { granted });
  return response.data;
}

export async function requestDataExport(): Promise<{ request_id: string; message: string }> {
  const response = await api.post('/consent/data-export-request');
  return response.data;
}

export async function requestDataDeletion(): Promise<{ request_id: string; message: string }> {
  const response = await api.post('/consent/data-deletion-request');
  return response.data;
}

export async function cancelDataDeletion(): Promise<{ status: string; message: string }> {
  const response = await api.post('/consent/data-deletion-request/cancel');
  return response.data;
}

export async function getSystemAuditLogs(
  params: { search?: string; page?: number; limit?: number } = {}
): Promise<AuditLog[]> {
  const response = await api.get<AuditLog[]>('/admin/audit-logs', { params });
  return response.data;
}

export async function getDataExportRequests(): Promise<DataExportRequest[]> {
  const response = await api.get<DataExportRequest[]>('/consent/data-export-requests');
  return response.data;
}

export async function getDataDeletionRequests(): Promise<DataDeletionRequest[]> {
  const response = await api.get<DataDeletionRequest[]>('/consent/data-deletion-requests');
  return response.data;
}

// ==========================================
// Customer → Advisor Management Functions
// ==========================================

export async function getMyAdvisors(): Promise<LinkedAdvisor[]> {
  const response = await api.get<LinkedAdvisor[]>('/advisors/my-advisors');
  return response.data;
}

export async function createAdvisorAssignment(
  advisorEmail: string
): Promise<{ assignment_id: string; advisor_name: string; advisor_email: string }> {
  const response = await api.post('/advisors/assignments', { advisor_email: advisorEmail });
  return response.data;
}

export async function deleteAdvisorAssignment(assignmentId: string): Promise<{ message: string }> {
  const response = await api.delete(`/advisors/assignments/${assignmentId}`);
  return response.data;
}
