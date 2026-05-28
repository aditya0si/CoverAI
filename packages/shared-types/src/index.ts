import { z } from "zod";

// ==========================================
// User Schemas & Types
// ==========================================
export const UserRoleSchema = z.enum(["admin", "agent", "customer"]);
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
export const PolicyStatusSchema = z.enum(["draft", "active", "expired", "cancelled"]);
export type PolicyStatus = z.infer<typeof PolicyStatusSchema>;

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
  claim_type: "own_damage" | "third_party" | "theft" | "natural_calamity" | "fire";
  status: ClaimStatus;
  assigned_officer_id: string | null;
  ai_risk_score: number | null;
  ai_summary: unknown;
  estimated_amount: number;
  approved_amount: number | null;
  created_at: string;
  updated_at: string;
}
