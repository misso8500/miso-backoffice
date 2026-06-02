import type { Recipient } from "./types";

export const sampleRecipients: Recipient[] = [
  {
    id: "recipient-001",
    name: "김미소",
    birthDate: "1942-03-15",
    longTermCareNumber: "LTC-2026-0001",
    careGrade: "3등급",
    phone: "010-1111-2222",
    address: "서울시 강서구 예시로 10",
    representativeName: "박하나",
    representativeRelation: "자녀",
    representativePhone: "010-2222-3333",
    serviceStartDate: "2026-01-01",
    serviceEndDate: "2026-12-31",
    contractRegisteredDate: "2025-12-20",
    contractExpiredDate: "2026-12-31",
    createdAt: "2026-04-29T09:00:00+09:00",
    updatedAt: "2026-04-29T09:00:00+09:00"
  },
  {
    id: "recipient-002",
    name: "이미래",
    birthDate: "1938-08-21",
    longTermCareNumber: "LTC-2026-0002",
    careGrade: "2등급",
    address: "서울시 양천구 예시길 22",
    representativeName: "최도윤",
    representativeRelation: "배우자",
    representativePhone: "010-3333-4444",
    serviceStartDate: "2026-02-01",
    serviceEndDate: "2027-01-31",
    contractRegisteredDate: "2026-01-25",
    contractExpiredDate: "2027-01-31",
    createdAt: "2026-04-29T09:10:00+09:00",
    updatedAt: "2026-04-29T09:10:00+09:00"
  },
  {
    id: "recipient-003",
    name: "정바른",
    birthDate: "1945-11-02",
    longTermCareNumber: "LTC-2026-0003",
    careGrade: "4등급",
    phone: "010-4444-5555",
    address: "서울시 마포구 샘플대로 5",
    representativeName: "한서연",
    representativeRelation: "조카",
    representativePhone: "010-5555-6666",
    serviceStartDate: "2025-05-01",
    serviceEndDate: "2026-04-30",
    contractRegisteredDate: "2025-04-20",
    contractExpiredDate: "2026-04-30",
    createdAt: "2026-04-29T09:20:00+09:00",
    updatedAt: "2026-04-29T09:20:00+09:00"
  }
];

export function getRecipientById(id: string) {
  return sampleRecipients.find((recipient) => recipient.id === id);
}

