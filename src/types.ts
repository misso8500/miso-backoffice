export type Recipient = {
  id: string;
  name: string;
  operationalName?: string;
  assignedBackofficeUserId?: string;
  birthDate: string;
  longTermCareNumber: string;
  careGrade: string;
  phone?: string;
  address: string;
  representativeName: string;
  representativeRelation: string;
  representativePhone: string;
  serviceType: "방문" | "가족";
  caregiverRequirements: string;
  reductionType: "일반" | "감경" | "기초";
  relatedPeople: string;
  serviceStartDate: string;
  serviceEndDate: string;
  contractRegisteredDate: string;
  contractExpiredDate: string;
  enabled: boolean;
  recontractCount: number;
  createdAt: string;
  updatedAt: string;
};

export type BackofficeUser = {
  id: string;
  name: string;
  birthDate: string;
  createdAt: string;
};

export type BackofficeSession = {
  deviceId: string;
  deviceName: string;
  userId: string;
  userName: string;
  lastSeenAt: string;
};

export type BackofficeState = {
  users: BackofficeUser[];
  sessions: BackofficeSession[];
};

export type RecipientInput = Omit<
  Recipient,
  "createdAt" | "updatedAt" | "enabled" | "recontractCount"
> &
  Partial<Pick<Recipient, "createdAt" | "updatedAt" | "enabled" | "recontractCount">>;

export type ContractRestoreType = "paused_return" | "recontracted";

export type RestoreRecipientInput = {
  restoreType: ContractRestoreType;
  documentsConfirmed: boolean;
  serviceStartDate?: string;
  serviceEndDate?: string;
  contractRegisteredDate?: string;
  contractExpiredDate?: string;
  memo?: string;
};

export type TerminateContractInput = {
  contractExpiredDate: string;
};

export type EmploymentContract = {
  id: string;
  workerName: string;
  workerBirthDate: string;
  residentRegistrationNumber: string;
  workerPhone?: string;
  primaryBank: string;
  bankAccountNumber: string;
  workerAddress: string;
  jobTitle: string;
  employmentType: string;
  workplaceType: "office" | "recipient_home";
  workplace: string;
  recipientAssignments: EmploymentRecipientAssignment[];
  contractStartDate: string;
  contractEndDate?: string;
  workDays: string;
  workStartTime: string;
  workEndTime: string;
  breakMinutes: number;
  wageType: string;
  wageAmount: number;
  nonTaxableVehicleAllowance: number;
  nonTaxableMealAllowance: number;
  taxableExtraPay: number;
  allowanceMemo?: string;
  paymentDate: string;
  insuranceStatus: string;
  insuranceSnapshots: EmploymentInsuranceSnapshot[];
  contractTerms: EmploymentContractTerm[];
  workConditions?: EmploymentWorkConditions;
  memo?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type EmploymentContractTerm = {
  id?: string;
  wageType: "월급" | "시급";
  wageAmount: number;
  nonTaxableMealAllowance: number;
  nonTaxableVehicleAllowance: number;
  otherNonTaxablePay: number;
};

export type EmploymentWorkCondition = {
  termId: string;
  recipientId: string;
  serviceType: string;
  familyCare: boolean;
  matchingStatus: "pending" | "active" | "paused" | "ended";
  statusDate: string;
  effectiveStartDate: string;
  effectiveEndDate: string;
  workDays: string;
  workStartTime: string;
  workEndTime: string;
  breakMinutes: number;
  monthlyHourLimit: number;
  vehicleSupportPerVisit: number;
  changeReason: string;
  documentStatus: "confirmed" | "needs_confirmation";
};

export type EmploymentWorkConditions = {
  monthlyTravelAllowance: number;
  conditions: EmploymentWorkCondition[];
  history: {
    changedAt: string;
    monthlyTravelAllowance: number;
    conditions: EmploymentWorkCondition[];
    contractTerms: EmploymentContractTerm[];
  }[];
};

export type EmploymentRecipientAssignment = {
  recipientId: string;
  recipientName?: string;
  careGrade?: string;
  workplaceAddress?: string;
};

export type EmploymentInsuranceSnapshot = {
  id?: string;
  status: string;
  effectiveStartDate: string;
  effectiveEndDate?: string;
  weeklyHours: number;
  memo?: string;
};

export type EmploymentContractInput = Omit<
  EmploymentContract,
  "createdAt" | "updatedAt" | "enabled"
> &
  Partial<Pick<EmploymentContract, "createdAt" | "updatedAt" | "enabled">>;
