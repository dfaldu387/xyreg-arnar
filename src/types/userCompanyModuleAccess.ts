// Type definitions for user_company_module_access table

export interface UserCompanyModuleAccess {
  id: string;
  user_id: string;
  company_id: string;
  module_ids: string[];
  is_active: boolean;
  assigned_by: string | null;
  assigned_at: string;
  created_at: string;
  updated_at: string;
}

export interface CreateUserCompanyModuleAccessInput {
  user_id: string;
  company_id: string;
  module_ids: string[];
  is_active?: boolean;
  assigned_by?: string | null;
}

export interface UpdateUserCompanyModuleAccessInput {
  module_ids?: string[];
  is_active?: boolean;
}

// Company Dashboard Module IDs
export const COMPANY_MODULES = {
  DASHBOARD: 'company-dashboard',
  DEVICE_PORTFOLIO: 'company-products',
  MILESTONES: 'company-milestones',
  COMPLIANCE_INSTANCES: 'compliance-instances',
  OPERATIONS: 'operations',
  COMMERCIAL: 'commercial',
  POST_MARKET_SURVEILLANCE: 'company-pms',
  COMMUNICATIONS: 'communications',
  AUDIT_LOG: 'audit-log',
} as const;

// Module display names
export const MODULE_DISPLAY_NAMES: Record<string, string> = {
  [COMPANY_MODULES.DASHBOARD]: 'Dashboard',
  [COMPANY_MODULES.DEVICE_PORTFOLIO]: 'Device Portfolio',
  [COMPANY_MODULES.MILESTONES]: 'Milestones',
  [COMPANY_MODULES.COMPLIANCE_INSTANCES]: 'Compliance Instances',
  [COMPANY_MODULES.OPERATIONS]: 'Operations',
  [COMPANY_MODULES.COMMERCIAL]: 'Commercial',
  [COMPANY_MODULES.POST_MARKET_SURVEILLANCE]: 'Post-Market Surveillance',
  [COMPANY_MODULES.COMMUNICATIONS]: 'Communication',
  [COMPANY_MODULES.AUDIT_LOG]: 'Audit Log',
};

// All available modules as an array
export const ALL_COMPANY_MODULES = Object.values(COMPANY_MODULES);

