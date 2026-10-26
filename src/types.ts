export type Recipient = {
  isDraft?: boolean;
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
  medicalHistory?: string;
  familyNotes?: string;
  hospitalNotes?: string;
  servicePlanNotes?: string;
  planSummary?: RecipientPlanSummary;
  recognitionPeriods?: RecognitionPeriod[];
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
  "createdAt" | "updatedAt" | "enabled" | "recontractCount" | "caregiverRequirements"
> &
  { caregiverRequirements?: string } &
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
  isDraft?: boolean;
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

export type RecipientPlanNotes = {
  medicalHistory: string; caregiverRequirements: string; familyNotes: string; hospitalNotes: string; servicePlanNotes: string;
};
export type RecipientPlanVersion = {
  id: string; version: number; notes: RecipientPlanNotes; effectiveDate: string | null; changeReason: string;
  changeKind: 'change' | 'correction' | 'progress' | 'legacy'; sourceVersion: number | null; authorName: string; createdAt: string; planId: string | null; schedule: RecipientPlanSchedule | null;
};
export type RecipientPlanState = {
  context: { institutionPeriod: { startDate: string; endDate: string }; careGrade: string; recognitionPeriods: RecognitionPeriod[] };
  plans: PlanExecution[]; executionCurrent: PlanExecution | null; regularRequirement: RegularPlanRequirement | null;
  version: number; current: RecipientPlanVersion | null; latest: RecipientPlanVersion | null;
  nextEffectiveDate: string | null; history: RecipientPlanVersion[]; legacyNotes: RecipientPlanNotes;
};
export type RecipientPlanInput = { version: number; notes: RecipientPlanNotes; effectiveDate: string; changeKind: 'change' | 'correction' | 'progress'; changeReason: string; sourceVersion?: number; schedule?: RecipientPlanScheduleInput };

export type RecognitionPeriod = { id: string; startDate: string; endDate: string; careGrade?: string };
export type RecipientPlanScheduleInput = {
  category: 'initial' | 'regular' | 'recognition_renewal' | 'grade_change' | 'needs_change';
  status: 'draft' | 'completed'; endDate: string; writtenDate: string | null; notifiedDate: string | null;
  recognitionPeriod: RecognitionPeriod | null;
};
export type RecipientPlanSchedule = RecipientPlanScheduleInput & { deadline: string | null; institutionPeriod: { startDate: string; endDate: string } };
export type PlanExecution = Omit<RecipientPlanVersion,'schedule'> & { schedule: RecipientPlanSchedule; executionEndDate: string; executionStatus: string; deadlineStatus: string; active: boolean };
export type RegularPlanRequirement = { startDate: string; endDate: string; deadline: string; status: 'draft' | 'completed' | 'missing'; deadlinePassed: boolean; planId: string | null };
export type PlanSummaryRecord = Pick<RecipientPlanVersion,'id'|'version'|'planId'|'effectiveDate'|'authorName'|'schedule'> & { executionEndDate: string | null; executionStatus: string; deadlineStatus?: string };
export type RecipientPlanSummary = { version: number; current: PlanSummaryRecord | null; nextEffectiveDate: string | null; executionCurrent: PlanSummaryRecord | null; regularRequirement: RegularPlanRequirement | null; plans: PlanSummaryRecord[] };
