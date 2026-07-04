export type Recipient = {
  id: string;
  name: string;
  birthDate: string;
  longTermCareNumber: string;
  careGrade: string;
  phone?: string;
  address: string;
  representativeName: string;
  representativeRelation: string;
  representativePhone: string;
  serviceStartDate: string;
  serviceEndDate: string;
  contractRegisteredDate: string;
  contractExpiredDate: string;
  enabled: boolean;
  recontractCount: number;
  createdAt: string;
  updatedAt: string;
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
