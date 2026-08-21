import { useAppStore } from '@/lib/store';
import { UserRole } from '@coverai/shared-types';

export interface RoleCapabilities {
  role: UserRole;
  isCustomer: boolean;
  isInsurer: boolean;
  isAdvisor: boolean;
  isAdmin: boolean;
  isAggregator: boolean;
  portalTitle: string;
  badgeLabel: string;
  canViewClaimsQueue: boolean;
  canAssessClaims: boolean;
  canManagePolicies: boolean;
  canExportData: boolean;
}

export function useRole(): RoleCapabilities {
  const { user } = useAppStore();
  const role = (user?.role || 'customer') as UserRole;

  return {
    role,
    isCustomer: role === 'customer',
    isInsurer: role === 'insurer_officer',
    isAdvisor: role === 'advisor',
    isAdmin: role === 'admin',
    isAggregator: role === 'aggregator',
    portalTitle:
      role === 'insurer_officer'
        ? 'Insurer Claims Portal'
        : role === 'advisor'
        ? 'Advisor Customer Hub'
        : role === 'admin'
        ? 'System Administration'
        : 'Customer Policy Portal',
    badgeLabel:
      role === 'insurer_officer'
        ? 'Claims Officer'
        : role === 'advisor'
        ? 'Insurance Advisor'
        : role === 'admin'
        ? 'Administrator'
        : 'Policyholder',
    canViewClaimsQueue: role === 'insurer_officer' || role === 'admin',
    canAssessClaims: role === 'insurer_officer' || role === 'admin',
    canManagePolicies: true,
    canExportData: true,
  };
}
