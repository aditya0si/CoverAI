import { z } from "zod";

// ==========================================
// User Schemas & Types
// ==========================================
export const UserRoleSchema = z.enum([
  "admin",
  "insurer_officer",
  "advisor",
  "aggregator",
  "customer",
]);
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  role: UserRoleSchema.default("customer"),
  isActive: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type User = z.infer<typeof UserSchema>;

export const CreateUserSchema = UserSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateUser = z.infer<typeof CreateUserSchema>;

// ==========================================
// Vehicle Schemas & Types
// ==========================================
export const VehicleSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  make: z.string().min(1, "Make is required"),
  model: z.string().min(1, "Model is required"),
  year: z.number().int().min(1900).max(new Date().getFullYear() + 1),
  vin: z.string().length(17, "VIN must be exactly 17 characters"),
  licensePlate: z.string().min(2, "License plate is required"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Vehicle = z.infer<typeof VehicleSchema>;

export const CreateVehicleSchema = VehicleSchema.omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateVehicle = z.infer<typeof CreateVehicleSchema>;

// ==========================================
// Policy Schemas & Types
// ==========================================
export const PolicyStatusSchema = z.enum(["draft", "active", "expired", "cancelled", "pending"]);
export type PolicyStatus = z.infer<typeof PolicyStatusSchema>;
export type PolicyType = "comprehensive" | "third_party" | "own_damage";

export const PolicySchema = z.object({
  id: z.string().uuid(),
  policyNumber: z.string().min(5),
  holderId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  coverageAmount: z.number().positive(),
  premiumAmount: z.number().positive(),
  status: PolicyStatusSchema.default("draft"),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Policy = z.infer<typeof PolicySchema>;

export const CreatePolicySchema = PolicySchema.omit({
  id: true,
  policyNumber: true,
  createdAt: true,
  updatedAt: true,
});
export type CreatePolicy = z.infer<typeof CreatePolicySchema>;

export interface PolicyDetail {
  id: string;
  policy_number: string;
  user_id: string;
  insurer_name: string;
  vehicle_registration: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number;
  pdf_storage_path: string | null;
  policy_type: PolicyType;
  start_date: string;
  end_date: string;
  premium_amount: number;
  sum_insured: number;
  status: PolicyStatus;
  created_at: string;
  updated_at: string;
}

export interface PolicyUploadResponse {
  policy_id: string;
  policy_number: string;
  message: string;
}

export interface PolicySummary {
  id: string;
  policy_number: string;
  insurer_name: string;
  vehicle_registration: string;
  vehicle_make: string;
  vehicle_model: string;
  vehicle_year: number;
  policy_type: string;
  start_date: string;
  end_date: string;
  premium_amount: number;
  sum_insured: number;
  status: string;
  extracted_text?: string | null;
}

// ==========================================
// Claim Schemas & Types
// ==========================================
export const ClaimStatusSchema = z.enum([
  "draft",
  "submitted",
  "under_review",
  "surveyor_assigned",
  "approved",
  "rejected",
  "settled",
  "disputed",
]);
export type ClaimStatus = z.infer<typeof ClaimStatusSchema>;
export type ClaimType = "own_damage" | "third_party" | "theft" | "natural_calamity" | "fire";
export type RiskLevel = "low" | "medium" | "high";

export const ClaimSchema = z.object({
  id: z.string().uuid(),
  policyId: z.string().uuid(),
  claimNumber: z.string().min(5),
  description: z.string().min(10, "Claim description must be at least 10 characters"),
  estimatedAmount: z.number().nonnegative(),
  status: ClaimStatusSchema.default("submitted"),
  incidentDate: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const CreateClaimSchema = ClaimSchema.omit({
  id: true,
  claimNumber: true,
  createdAt: true,
  updatedAt: true,
});
export type CreateClaim = z.infer<typeof CreateClaimSchema>;

// BackendClaim: matches the actual FastAPI snake_case response shape
export interface BackendClaim {
  id: string;
  claim_number: string;
  policy_id: string;
  claimant_id: string;
  incident_date: string;
  incident_location: string;
  incident_description: string;
  claim_type: ClaimType;
  status: ClaimStatus;
  assigned_officer_id: string | null;
  ai_risk_score: number | null;
  ai_summary: unknown;
  estimated_amount: number;
  approved_amount: number | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimImage {
  id: string;
  storage_path: string;
  signed_url: string;
  ai_damage_tags: Record<string, unknown> | null;
  ai_damage_confidence: number | null;
  is_verified: boolean;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}

export interface AITriageAssessment {
  risk_score: number;
  coverage_assessment: string;
  key_policy_clauses: string[];
  red_flags: string[];
  recommended_action: string;
  summary_for_officer: string;
  customer_prediction?: string;
  customer_explanation?: string;
}

export interface ClaimDetail {
  id: string;
  claim_number: string;
  policy_id: string;
  claimant_id: string;
  incident_date: string;
  incident_location: string;
  incident_description: string;
  claim_type: ClaimType;
  status: ClaimStatus;
  assigned_officer_id: string | null;
  ai_risk_score: number | null;
  ai_summary: AITriageAssessment | null;
  ai_customer_prediction: string | null;
  ai_customer_explanation: string | null;
  estimated_amount: number;
  approved_amount: number | null;
  created_at: string;
  updated_at: string;
  images: ClaimImage[];
  status_history: AuditLog[];
  policy?: PolicySummary | null;
}

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

// ==========================================
// Conversation & Advisor Types
// ==========================================
export interface ConversationResponse {
  conversation_id: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  created_at: string;
}

export interface InsurerQueueFilters {
  status?: ClaimStatus;
  claim_type?: ClaimType;
  risk_level?: RiskLevel;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export interface AdvisorCustomer {
  customer_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  active_policy_count: number;
  open_claim_count: number;
  assigned_at: string;
}

export interface LinkedAdvisor {
  assignment_id: string;
  advisor_id: string;
  advisor_name: string;
  advisor_email: string;
  advisor_phone: string;
  assigned_at: string;
}

// ==========================================
// Consent & DPDP Privacy Types
// ==========================================
export interface ConsentRecord {
  consent_type: "data_processing" | "marketing" | "ai_analysis" | "third_party_sharing";
  granted: boolean;
  granted_at: string;
  revoked_at: string | null;
}

export interface DataExportRequest {
  id: string;
  status: "pending" | "completed" | "failed";
  created_at: string;
  completed_at: string | null;
  download_url: string | null;
}

export interface DataDeletionRequest {
  id: string;
  status: "pending" | "completed" | "cancelled" | "failed";
  created_at: string;
  completed_at: string | null;
}

