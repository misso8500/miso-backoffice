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
  createdAt: string;
  updatedAt: string;
};

export type RecipientInput = Omit<Recipient, "createdAt" | "updatedAt"> &
  Partial<Pick<Recipient, "createdAt" | "updatedAt">>;
