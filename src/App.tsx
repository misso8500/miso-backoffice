import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  CalendarClock,
  ChevronRight,
  Database,
  ClipboardCheck,
  Download,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  FileX2,
  Trash2,
  Upload,
  UserPlus,
  UserRound,
  Users,
  X
} from "lucide-react";
import {
  createEmploymentContract,
  createBackofficeUser,
  createRecipient,
  deleteRecipient,
  loadEmploymentContracts,
  loadBackofficeState,
  loadRecipients,
  restoreRecipient,
  terminateContract,
  updateEmploymentContract,
  updateRecipient,
  activateBackofficeUser
} from "./storage";
import type {
  BackofficeSession,
  BackofficeUser,
  ContractRestoreType,
  EmploymentContract,
  EmploymentContractInput,
  Recipient,
  RecipientInput
} from "./types";

type RecipientFormState = {
  name: string;
  operationalName: string;
  birthDate: string;
  longTermCareNumber: string;
  careGrade: string;
  phone: string;
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
};

const emptyRecipientForm: RecipientFormState = {
  name: "",
  operationalName: "",
  birthDate: "",
  longTermCareNumber: "",
  careGrade: "3등급",
  phone: "",
  address: "",
  representativeName: "",
  representativeRelation: "",
  representativePhone: "",
  serviceType: "방문",
  caregiverRequirements: "",
  reductionType: "일반",
  relatedPeople: "",
  serviceStartDate: "",
  serviceEndDate: "",
  contractRegisteredDate: "",
  contractExpiredDate: ""
};

type RestoreFormState = {
  restoreType: ContractRestoreType;
  documentsConfirmed: boolean;
  serviceStartDate: string;
  serviceEndDate: string;
  contractRegisteredDate: string;
  contractExpiredDate: string;
  memo: string;
};

type EmploymentContractFormState = {
  workerName: string;
  residentRegistrationNumber: string;
  workerPhone: string;
  primaryBank: string;
  bankAccountNumber: string;
  terms: EmploymentContractTermFormState[];
};

type EmploymentContractTermFormState = {
  id: string;
  wageType: "월급" | "시급";
  wageAmount: string;
  nonTaxableMealAllowance: string;
  nonTaxableVehicleAllowance: string;
  otherNonTaxablePay: string;
};

const createEmptyEmploymentTerm = (): EmploymentContractTermFormState => ({
  id: `employment-term-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  wageType: "월급",
  wageAmount: "",
  nonTaxableMealAllowance: "0",
  nonTaxableVehicleAllowance: "0",
  otherNonTaxablePay: "0"
});

const emptyEmploymentContractForm: EmploymentContractFormState = {
  workerName: "",
  residentRegistrationNumber: "",
  workerPhone: "",
  primaryBank: "",
  bankAccountNumber: "",
  terms: [createEmptyEmploymentTerm()]
};

const requiredFormFields: Array<{ key: keyof RecipientFormState; label: string }> = [
  { key: "name", label: "수급자 이름" },
  { key: "operationalName", label: "업무식별명" },
  { key: "birthDate", label: "생년월일" },
  { key: "longTermCareNumber", label: "장기요양인정번호" },
  { key: "careGrade", label: "장기요양등급" },
  { key: "address", label: "수급자 주소" },
  { key: "representativeName", label: "대표 연락자 이름" },
  { key: "representativeRelation", label: "대표 연락자 관계" },
  { key: "representativePhone", label: "대표 연락자 연락처" },
  { key: "serviceStartDate", label: "장기요양이용계약 시작일" },
  { key: "serviceEndDate", label: "장기요양이용계약 만료일" }
];

const requiredEmploymentContractFields: Array<{
  key: keyof EmploymentContractFormState;
  label: string;
}> = [
  { key: "workerName", label: "근로자 이름" },
  { key: "residentRegistrationNumber", label: "주민번호" },
  { key: "workerPhone", label: "전화번호" },
  { key: "primaryBank", label: "주거래 은행" },
  { key: "bankAccountNumber", label: "계좌번호" }
];

const createRecipientId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `recipient-${Date.now()}`;
};

const createEmploymentContractId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `employment-contract-${Date.now()}`;
};

const formatPhoneNumberInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 11);

  if (digits.startsWith("02")) {
    if (digits.length <= 2) {
      return digits;
    }

    if (digits.length <= 6) {
      return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    }

    if (digits.length <= 10) {
      return `${digits.slice(0, 2)}-${digits.slice(2, digits.length - 4)}-${digits.slice(-4)}`;
    }
  }

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};

const formatResidentNumberInput = (value: string) => {
  const digits = value.replace(/\D/g, "").slice(0, 13);

  if (digits.length <= 6) {
    return digits;
  }

  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
};

const formatBankAccountNumberInput = (value: string) =>
  value.replace(/[^\d-]/g, "").replace(/-{2,}/g, "-").slice(0, 32);

const escapeCsvValue = (value: string | number | boolean | null | undefined) => {
  const stringValue = value === null || value === undefined ? "" : String(value);

  if (/[",\n\r]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

const downloadCsv = (
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
) => {
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => escapeCsvValue(value)).join(","))
    .join("\r\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const downloadRecipientCsvExample = () => {
  downloadCsv(
    "miso-recipient-example.csv",
    [
      "id",
      "name",
      "operationalName",
      "birthDate",
      "longTermCareNumber",
      "careGrade",
      "phone",
      "address",
      "representativeName",
      "representativeRelation",
      "representativePhone",
      "serviceType",
      "caregiverRequirements",
      "reductionType",
      "relatedPeople",
      "serviceStartDate",
      "serviceEndDate",
      "enabled"
    ],
    [
      [
        "recipient-import-001",
        "김예시",
        "김예시/3/강서구/독거",
        "1944-05-10",
        "LTC-2026-9001",
        "3등급",
        "010-1234-5678",
        "서울시 강서구 예시로 100",
        "박보호",
        "자녀",
        "010-2222-3333",
        "방문",
        "여성 요양보호사, 자차 운전 가능",
        "일반",
        "홍길동(이웃) 010-0000-0000",
        "2026-01-01",
        "2026-12-31",
        "false"
      ]
    ]
  );
};

const downloadEmploymentContractCsvExample = () => {
  downloadCsv(
    "miso-employment-contract-example.csv",
    [
      "workerGroupId",
      "workerName",
      "residentRegistrationNumber",
      "workerPhone",
      "primaryBank",
      "bankAccountNumber",
      "termOrder",
      "wageType",
      "wageAmount",
      "nonTaxableMealAllowance",
      "nonTaxableVehicleAllowance",
      "otherNonTaxablePay",
      "enabled"
    ],
    [
      [
        "worker-import-001",
        "이근로",
        "941025-1234567",
        "010-1234-1234",
        "국민은행",
        "123-456-789012",
        1,
        "월급",
        2300000,
        200000,
        100000,
        0,
        "false"
      ],
      [
        "worker-import-001",
        "이근로",
        "941025-1234567",
        "010-1234-1234",
        "국민은행",
        "123-456-789012",
        2,
        "시급",
        14000,
        0,
        50000,
        0,
        "false"
      ]
    ]
  );
};

type CsvRow = Record<string, string>;

const parseCsv = (text: string) => {
  const normalizedText = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let isInsideQuote = false;

  for (let index = 0; index < normalizedText.length; index += 1) {
    const character = normalizedText[index];
    const nextCharacter = normalizedText[index + 1];

    if (character === '"' && isInsideQuote && nextCharacter === '"') {
      currentValue += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      isInsideQuote = !isInsideQuote;
      continue;
    }

    if (character === "," && !isInsideQuote) {
      currentRow.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !isInsideQuote) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      currentRow.push(currentValue.trim());
      rows.push(currentRow);
      currentRow = [];
      currentValue = "";
      continue;
    }

    currentValue += character;
  }

  currentRow.push(currentValue.trim());
  rows.push(currentRow);

  const [headers = [], ...bodyRows] = rows.filter((row) =>
    row.some((value) => value.trim().length > 0)
  );

  return bodyRows.map((row) =>
    headers.reduce<CsvRow>((accumulator, header, index) => {
      accumulator[header.trim()] = row[index]?.trim() ?? "";
      return accumulator;
    }, {})
  );
};

const readCsvFile = (file: File) =>
  new Promise<CsvRow[]>((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(parseCsv(String(reader.result ?? "")));
    reader.onerror = () => reject(new Error("CSV 파일을 읽지 못했습니다."));
    reader.readAsText(file, "utf-8");
  });

const parseCsvBoolean = (value: string | undefined, defaultValue = false) => {
  if (!value) {
    return defaultValue;
  }

  return ["true", "1", "yes", "y", "활성", "유효"].includes(value.trim().toLocaleLowerCase());
};

const parseCsvNumber = (value: string | undefined, field: string) => {
  const numericValue = Number(String(value ?? "").replace(/,/g, ""));

  if (!Number.isFinite(numericValue)) {
    throw new Error(`${field} 값은 숫자여야 합니다.`);
  }

  return numericValue;
};

const requireCsvValue = (row: CsvRow, field: string) => {
  const value = row[field]?.trim();

  if (!value) {
    throw new Error(`${field} 값을 입력하세요.`);
  }

  return value;
};

const deriveBirthDateFromResidentNumber = (residentRegistrationNumber: string) => {
  const digits = residentRegistrationNumber.replace(/\D/g, "");

  if (digits.length < 7) {
    return null;
  }

  const yearPart = Number(digits.slice(0, 2));
  const monthPart = Number(digits.slice(2, 4));
  const dayPart = Number(digits.slice(4, 6));
  const centuryCode = digits[6];
  const century =
    centuryCode === "9" || centuryCode === "0"
      ? 1800
      : centuryCode === "1" || centuryCode === "2" || centuryCode === "5" || centuryCode === "6"
        ? 1900
        : centuryCode === "3" || centuryCode === "4" || centuryCode === "7" || centuryCode === "8"
          ? 2000
          : null;

  if (!century) {
    return null;
  }

  const birthDate = new Date(century + yearPart, monthPart - 1, dayPart);

  if (
    birthDate.getFullYear() !== century + yearPart ||
    birthDate.getMonth() !== monthPart - 1 ||
    birthDate.getDate() !== dayPart
  ) {
    return null;
  }

  return [
    birthDate.getFullYear(),
    String(birthDate.getMonth() + 1).padStart(2, "0"),
    String(birthDate.getDate()).padStart(2, "0")
  ].join("-");
};

const calculateAgeFromBirthDate = (birthDate: string) => {
  const parsedBirthDate = new Date(`${birthDate}T00:00:00`);

  if (Number.isNaN(parsedBirthDate.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - parsedBirthDate.getFullYear();
  const hasBirthdayPassedThisYear =
    today.getMonth() > parsedBirthDate.getMonth() ||
    (today.getMonth() === parsedBirthDate.getMonth() &&
      today.getDate() >= parsedBirthDate.getDate());

  if (!hasBirthdayPassedThisYear) {
    age -= 1;
  }

  return age >= 0 ? age : null;
};

const getEmploymentBirthDate = (contract: EmploymentContract) =>
  deriveBirthDateFromResidentNumber(contract.residentRegistrationNumber) ?? contract.workerBirthDate;

const formatEmploymentAge = (contract: EmploymentContract) => {
  const birthDate = getEmploymentBirthDate(contract);
  const age = calculateAgeFromBirthDate(birthDate);
  return age === null ? undefined : `만 ${age}세`;
};

const detailSections: Array<{
  title: string;
  fields: Array<{ label: string; value: (recipient: Recipient) => string | undefined }>;
}> = [
  {
    title: "기본 정보",
    fields: [
      { label: "수급자 이름", value: (recipient) => recipient.name },
      { label: "생년월일", value: (recipient) => recipient.birthDate },
      { label: "장기요양인정번호", value: (recipient) => recipient.longTermCareNumber },
      { label: "장기요양등급", value: (recipient) => recipient.careGrade },
      { label: "수급자 연락처", value: (recipient) => recipient.phone },
      { label: "수급자 주소", value: (recipient) => recipient.address }
    ]
  },
  {
    title: "대표 연락자",
    fields: [
      { label: "이름", value: (recipient) => recipient.representativeName },
      { label: "관계", value: (recipient) => recipient.representativeRelation },
      { label: "연락처", value: (recipient) => recipient.representativePhone }
    ]
  },
  {
    title: "장기요양이용계약",
    fields: [
      { label: "장기요양이용계약 시작일", value: (recipient) => recipient.serviceStartDate },
      { label: "장기요양이용계약 만료일", value: (recipient) => recipient.serviceEndDate },
      { label: "서비스 구분", value: (recipient) => recipient.serviceType },
      { label: "요양보호사 구인조건", value: (recipient) => recipient.caregiverRequirements },
      { label: "감경여부", value: (recipient) => recipient.reductionType },
      { label: "관련 지인", value: (recipient) => recipient.relatedPeople }
    ]
  },
  {
    title: "시스템 정보",
    fields: [
      {
        label: "유효 상태",
        value: (recipient) => (isRecipientEnabled(recipient) ? "유효함" : "비활성화")
      },
      { label: "복구/재계약 횟수", value: (recipient) => `${recipient.recontractCount}회` },
      { label: "내부 ID", value: (recipient) => recipient.id },
      { label: "생성일시", value: (recipient) => recipient.createdAt },
      { label: "수정일시", value: (recipient) => recipient.updatedAt }
    ]
  }
];

const employmentContractDetailSections: Array<{
  title: string;
  fields: Array<{ label: string; value: (contract: EmploymentContract) => string | undefined }>;
}> = [
  {
    title: "개인정보",
    fields: [
      { label: "근로자 이름", value: (contract) => contract.workerName },
      { label: "주민번호", value: (contract) => contract.residentRegistrationNumber },
      { label: "생년월일", value: (contract) => getEmploymentBirthDate(contract) },
      { label: "나이", value: (contract) => formatEmploymentAge(contract) },
      { label: "전화번호", value: (contract) => contract.workerPhone },
      { label: "주거래 은행", value: (contract) => contract.primaryBank },
      { label: "계좌번호", value: (contract) => contract.bankAccountNumber }
    ]
  },
  {
    title: "계약 묶음",
    fields: [
      {
        label: "계약 조건",
        value: (contract) => formatContractTerms(contract)
      }
    ]
  },
  {
    title: "시스템 정보",
    fields: [
      { label: "유효 상태", value: (contract) => (contract.enabled ? "유효함" : "비활성화") },
      { label: "메모", value: (contract) => contract.memo },
      { label: "내부 ID", value: (contract) => contract.id },
      { label: "생성일시", value: (contract) => contract.createdAt },
      { label: "수정일시", value: (contract) => contract.updatedAt }
    ]
  }
];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));

const formatCurrency = (value: number) => `${value.toLocaleString("ko-KR")}원`;

const formatContractTerms = (contract: EmploymentContract) => {
  const terms =
    contract.contractTerms.length > 0
      ? contract.contractTerms
      : [
          {
            wageType: contract.wageType as "월급" | "시급",
            wageAmount: contract.wageAmount,
            nonTaxableMealAllowance: contract.nonTaxableMealAllowance,
            nonTaxableVehicleAllowance: contract.nonTaxableVehicleAllowance,
            otherNonTaxablePay: contract.taxableExtraPay
          }
        ];

  return terms
    .map(
      (term, index) =>
        `${index + 1}. ${term.wageType} ${formatCurrency(term.wageAmount)} · 식대 ${formatCurrency(
          term.nonTaxableMealAllowance
        )} · 차량 ${formatCurrency(term.nonTaxableVehicleAllowance)} · 기타 ${formatCurrency(
          term.otherNonTaxablePay
        )}`
    )
    .join("\n");
};

const isRecipientEnabled = (recipient: Recipient) => recipient.enabled !== false;

type RecipientStatus = "급여시작" | "급여제공중" | "급여갱신필요" | "계약종료예정" | "계약종료";

const getRecipientStatus = (recipient: Recipient, now = new Date()): RecipientStatus => {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const start = new Date(`${recipient.serviceStartDate}T00:00:00`).getTime();
  const expiry = new Date(`${recipient.serviceEndDate}T00:00:00`).getTime();
  const daysUntilExpiry = Math.ceil((expiry - today) / 86_400_000);

  if (!isRecipientEnabled(recipient) || daysUntilExpiry < 0) return "계약종료";
  if (today < start) return "급여시작";
  if (daysUntilExpiry <= 14) return "계약종료예정";
  if (daysUntilExpiry <= 60) return "급여갱신필요";
  return "급여제공중";
};

const createBackofficeUserId = () =>
  `backoffice-user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const getDeviceId = () => {
  const storageKey = "miso-backoffice-device-id";
  const stored = window.localStorage.getItem(storageKey);
  if (stored) return stored;
  const created = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  window.localStorage.setItem(storageKey, created);
  return created;
};

const limitDateYear = (value: string) => {
  const match = value.match(/^(\d{4})\d*(-.*)?$/);
  return match ? `${match[1]}${match[2] ?? ""}` : value;
};

const dateInputLimits = { min: "1000-01-01", max: "9999-12-31" } as const;

const regionAliases: Record<string, string> = {
  서울특별시: "서울", 서울시: "서울", 부산광역시: "부산", 대구광역시: "대구",
  인천광역시: "인천", 광주광역시: "광주", 대전광역시: "대전", 울산광역시: "울산",
  세종특별자치시: "세종", 제주특별자치도: "제주"
};

const getResidenceSummary = (address: string) => {
  if (!address.trim() || address.trim() === "미등록") return "거주지 미등록";

  const parts = address.trim().split(/\s+/);
  const region = regionAliases[parts[0]] ?? parts[0].replace(/(특별시|광역시|특별자치시|특별자치도)$/, "");
  const neighborhood = parts.slice(1).find((part) => /(동|읍|면|리)$/.test(part));
  return [region, neighborhood ?? parts[1]].filter(Boolean).join(" ");
};

const getRecipientDisplayId = (recipient: Recipient) => {
  const birthYear = recipient.birthDate.slice(0, 4) || "연도미상";
  return recipient.operationalName?.trim() || `${recipient.name}/${recipient.careGrade.replace("등급", "")}/${getResidenceSummary(recipient.address)}/${birthYear}년생`;
};

const hasPrimaryContact = (recipient: Recipient) =>
  Boolean(recipient.representativeName && recipient.representativeName !== "미등록");

function App() {
  const [activeView, setActiveView] = useState<"recipients" | "employmentContracts">(
    "recipients"
  );
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [operationalNameDraft, setOperationalNameDraft] = useState("");
  const [operationalNameSaveMessage, setOperationalNameSaveMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showEnabledOnly, setShowEnabledOnly] = useState(true);
  const [selectedStatus, setSelectedStatus] = useState<RecipientStatus | "전체">("전체");
  const [selectedWorkerId, setSelectedWorkerId] = useState("all");
  const [viewDensity, setViewDensity] = useState<"simple" | "detail">("simple");
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ id: number; message: string } | null>(null);
  const [backofficeUsers, setBackofficeUsers] = useState<BackofficeUser[]>([]);
  const [backofficeSessions, setBackofficeSessions] = useState<BackofficeSession[]>([]);
  const [deviceId] = useState(getDeviceId);
  const [activeBackofficeUserId, setActiveBackofficeUserId] = useState(
    () => window.localStorage.getItem("miso-backoffice-active-user-id") ?? ""
  );
  const [isBackofficeUserModalOpen, setIsBackofficeUserModalOpen] = useState(false);
  const [isBackofficeUserFormOpen, setIsBackofficeUserFormOpen] = useState(false);
  const [newBackofficeUserName, setNewBackofficeUserName] = useState("");
  const [newBackofficeUserBirthDate, setNewBackofficeUserBirthDate] = useState("");
  const [backofficeUserError, setBackofficeUserError] = useState<string | null>(null);
  const [isBackofficeUserSaving, setIsBackofficeUserSaving] = useState(false);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [formState, setFormState] = useState<RecipientFormState>(emptyRecipientForm);
  const [formErrorMessage, setFormErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [recipientToDeactivate, setRecipientToDeactivate] = useState<Recipient | null>(null);
  const [deactivateErrorMessage, setDeactivateErrorMessage] = useState<string | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [recipientToTerminate, setRecipientToTerminate] = useState<Recipient | null>(null);
  const [terminationExpiredDate, setTerminationExpiredDate] = useState("");
  const [terminationErrorMessage, setTerminationErrorMessage] = useState<string | null>(null);
  const [isTerminating, setIsTerminating] = useState(false);
  const [recipientToRestore, setRecipientToRestore] = useState<Recipient | null>(null);
  const [restoreFormState, setRestoreFormState] = useState<RestoreFormState | null>(null);
  const [restoreErrorMessage, setRestoreErrorMessage] = useState<string | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [employmentContracts, setEmploymentContracts] = useState<EmploymentContract[]>([]);
  const [selectedEmploymentContractId, setSelectedEmploymentContractId] = useState<string | null>(
    null
  );
  const [employmentSearchQuery, setEmploymentSearchQuery] = useState("");
  const [showEnabledEmploymentOnly, setShowEnabledEmploymentOnly] = useState(true);
  const [isEmploymentLoading, setIsEmploymentLoading] = useState(true);
  const [employmentErrorMessage, setEmploymentErrorMessage] = useState<string | null>(null);
  const [isEmploymentCreatePanelOpen, setIsEmploymentCreatePanelOpen] = useState(false);
  const [employmentFormState, setEmploymentFormState] =
    useState<EmploymentContractFormState>(emptyEmploymentContractForm);
  const [employmentFormErrorMessage, setEmploymentFormErrorMessage] = useState<string | null>(
    null
  );
  const [isEmploymentSaving, setIsEmploymentSaving] = useState(false);
  const [employmentContractToDeactivate, setEmploymentContractToDeactivate] =
    useState<EmploymentContract | null>(null);
  const [employmentDeactivateErrorMessage, setEmploymentDeactivateErrorMessage] = useState<
    string | null
  >(null);
  const [isEmploymentDeactivating, setIsEmploymentDeactivating] = useState(false);

  const showNotification = useCallback((message: string) => {
    setNotification({ id: Date.now(), message });
  }, []);

  const fetchRecipients = useCallback(async () => {
    setIsLoading(true);

    try {
      const loadedRecipients = await loadRecipients();
      setRecipients(loadedRecipients);
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "수급자 정보를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchEmploymentContracts = useCallback(async () => {
    setIsEmploymentLoading(true);

    try {
      const loadedContracts = await loadEmploymentContracts();
      setEmploymentContracts(loadedContracts);
      setEmploymentErrorMessage(null);
    } catch (error) {
      setEmploymentErrorMessage(
        error instanceof Error ? error.message : "근로계약 정보를 불러오지 못했습니다."
      );
    } finally {
      setIsEmploymentLoading(false);
    }
  }, []);

  const fetchBackofficeState = useCallback(async () => {
    try {
      const state = await loadBackofficeState();
      setBackofficeUsers(state.users);
      setBackofficeSessions(state.sessions);
    } catch (error) {
      setBackofficeUserError(
        error instanceof Error ? error.message : "백오피스 사용자 정보를 불러오지 못했습니다."
      );
    }
  }, []);

  useEffect(() => {
    void fetchRecipients();
    void fetchEmploymentContracts();
    void fetchBackofficeState();
  }, [fetchBackofficeState, fetchEmploymentContracts, fetchRecipients]);

  useEffect(() => {
    const syncBackofficeSession = () => {
      if (activeBackofficeUserId) {
        void activateBackofficeUser(deviceId, {
          userId: activeBackofficeUserId,
          deviceName: window.location.host || "백오피스 기기"
        }).then((state) => {
          setBackofficeUsers(state.users);
          setBackofficeSessions(state.sessions);
        }).catch(() => undefined);
      } else {
        void fetchBackofficeState();
      }
    };

    syncBackofficeSession();
    const intervalId = window.setInterval(syncBackofficeSession, 15000);

    return () => window.clearInterval(intervalId);
  }, [activeBackofficeUserId, deviceId, fetchBackofficeState]);

  useEffect(() => {
    if (!notification) return;

    const timeoutId = window.setTimeout(() => setNotification(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [notification]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedRecipientId(null);
        setIsCreatePanelOpen(false);
        setEditingRecipientId(null);
        setRecipientToDeactivate(null);
        setRecipientToTerminate(null);
        setRecipientToRestore(null);
        setSelectedEmploymentContractId(null);
        setIsEmploymentCreatePanelOpen(false);
        setEmploymentContractToDeactivate(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredRecipients = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    return [...recipients]
      .filter((recipient) => {
        if (showEnabledOnly && !isRecipientEnabled(recipient)) {
          return false;
        }

        if (selectedStatus !== "전체" && getRecipientStatus(recipient) !== selectedStatus) {
          return false;
        }

        if (selectedWorkerId !== "all") {
          const worker = employmentContracts.find((contract) => contract.id === selectedWorkerId);
          if (!worker?.recipientAssignments.some(({ recipientId }) => recipientId === recipient.id)) {
            return false;
          }
        }

        if (!query) {
          return true;
        }

        return [
          recipient.name,
          recipient.operationalName,
          recipient.longTermCareNumber,
          recipient.careGrade,
          recipient.address,
          recipient.phone,
          recipient.representativeName,
          recipient.representativeRelation,
          recipient.representativePhone
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.serviceEndDate.localeCompare(b.serviceEndDate));
  }, [employmentContracts, recipients, searchQuery, selectedStatus, selectedWorkerId, showEnabledOnly]);

  const selectedRecipient =
    recipients.find((recipient) => recipient.id === selectedRecipientId) ?? null;
  const activeBackofficeUser =
    backofficeUsers.find((user) => user.id === activeBackofficeUserId) ?? null;

  useEffect(() => {
    setOperationalNameDraft(selectedRecipient?.operationalName ?? "");
    setOperationalNameSaveMessage(null);
  }, [selectedRecipient?.id, selectedRecipient?.operationalName]);
  const enabledRecipientCount = recipients.filter(isRecipientEnabled).length;
  const activeWorkers = employmentContracts.filter((contract) => contract.enabled);
  const getAssignedSocialWorkerNames = (recipientId: string) => {
    const recipient = recipients.find((item) => item.id === recipientId);
    const assignedUser = backofficeUsers.find(
      (user) => user.id === recipient?.assignedBackofficeUserId
    );
    if (assignedUser) return [assignedUser.name];

    const names = activeWorkers
      .filter((worker) =>
        worker.recipientAssignments.some((assignment) => assignment.recipientId === recipientId)
      )
      .map((worker) => worker.workerName);

    return [...new Set(names)];
  };
  const renewalCount = recipients.filter((recipient) =>
    ["급여갱신필요", "계약종료예정"].includes(getRecipientStatus(recipient))
  ).length;
  const filteredEmploymentContracts = useMemo(() => {
    const query = employmentSearchQuery.trim().toLocaleLowerCase();

    return [...employmentContracts]
      .filter((contract) => {
        if (showEnabledEmploymentOnly && !contract.enabled) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [
          contract.workerName,
          contract.workerPhone,
          contract.residentRegistrationNumber,
          contract.primaryBank,
          contract.bankAccountNumber,
          ...contract.contractTerms.map(
            (term) => `${term.wageType} ${term.wageAmount} ${term.nonTaxableMealAllowance}`
          )
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      })
      .sort((a, b) => b.contractStartDate.localeCompare(a.contractStartDate));
  }, [employmentContracts, employmentSearchQuery, showEnabledEmploymentOnly]);
  const selectedEmploymentContract =
    employmentContracts.find((contract) => contract.id === selectedEmploymentContractId) ?? null;
  const enabledEmploymentContractCount = employmentContracts.filter(
    (contract) => contract.enabled
  ).length;

  const updateFormField = (field: keyof RecipientFormState, value: string) => {
    const dateFields: Array<keyof RecipientFormState> = ["birthDate", "serviceStartDate", "serviceEndDate", "contractRegisteredDate", "contractExpiredDate"];
    setFormState((current) => ({ ...current, [field]: dateFields.includes(field) ? limitDateYear(value) : value }));
    setFormErrorMessage(null);
  };

  const updateEmploymentFormField = (field: keyof EmploymentContractFormState, value: string) => {
    setEmploymentFormState((current) => ({ ...current, [field]: value }));
    setEmploymentFormErrorMessage(null);
  };

  const updateEmploymentTermField = (
    termId: string,
    field: keyof Omit<EmploymentContractTermFormState, "id">,
    value: string
  ) => {
    setEmploymentFormState((current) => {
      const terms = current.terms.map((term) =>
        term.id === termId ? { ...term, [field]: value } : term
      );

      return { ...current, terms };
    });
    setEmploymentFormErrorMessage(null);
  };

  const addEmploymentTerm = () => {
    setEmploymentFormState((current) => ({
      ...current,
      terms: [...current.terms, createEmptyEmploymentTerm()]
    }));
    setEmploymentFormErrorMessage(null);
  };

  const removeEmploymentTerm = (termId: string) => {
    setEmploymentFormState((current) => ({
      ...current,
      terms:
        current.terms.length > 1
          ? current.terms.filter((term) => term.id !== termId)
          : current.terms
    }));
    setEmploymentFormErrorMessage(null);
  };

  const closeCreatePanel = () => {
    setIsCreatePanelOpen(false);
    setEditingRecipientId(null);
    setFormState(emptyRecipientForm);
    setFormErrorMessage(null);
  };

  const openRecipientEditPanel = (recipient: Recipient) => {
    setFormState({
      name: recipient.name,
      operationalName: recipient.operationalName ?? "",
      birthDate: recipient.birthDate,
      longTermCareNumber: recipient.longTermCareNumber,
      careGrade: recipient.careGrade,
      phone: recipient.phone ?? "",
      address: recipient.address,
      representativeName: recipient.representativeName,
      representativeRelation: recipient.representativeRelation,
      representativePhone: recipient.representativePhone,
      serviceType: recipient.serviceType ?? "방문",
      caregiverRequirements: recipient.caregiverRequirements ?? "",
      reductionType: recipient.reductionType ?? "일반",
      relatedPeople: recipient.relatedPeople ?? "",
      serviceStartDate: recipient.serviceStartDate,
      serviceEndDate: recipient.serviceEndDate,
      contractRegisteredDate: recipient.serviceStartDate,
      contractExpiredDate: recipient.serviceEndDate
    });
    setEditingRecipientId(recipient.id);
    setSelectedRecipientId(null);
    setFormErrorMessage(null);
    setIsCreatePanelOpen(true);
  };

  const closeEmploymentCreatePanel = () => {
    setIsEmploymentCreatePanelOpen(false);
    setEmploymentFormState(emptyEmploymentContractForm);
    setEmploymentFormErrorMessage(null);
  };

  const handleCreateRecipient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const missingField = requiredFormFields.find(({ key }) => !formState[key].trim());

    if (missingField) {
      setFormErrorMessage(`${missingField.label}을(를) 입력하세요.`);
      return;
    }

    if (formState.serviceStartDate > formState.serviceEndDate) {
      setFormErrorMessage("장기요양이용계약 시작일은 만료일보다 늦을 수 없습니다.");
      return;
    }

    const recipientBeingEdited = recipients.find((recipient) => recipient.id === editingRecipientId);
    const recipientToSave: RecipientInput = {
      id: recipientBeingEdited?.id ?? createRecipientId(),
      name: formState.name.trim(),
      operationalName: formState.operationalName.trim(),
      assignedBackofficeUserId: recipientBeingEdited?.assignedBackofficeUserId,
      birthDate: formState.birthDate,
      longTermCareNumber: formState.longTermCareNumber.trim(),
      careGrade: formState.careGrade.trim(),
      ...(formState.phone.trim()
        ? { phone: formatPhoneNumberInput(formState.phone.trim()) }
        : {}),
      address: formState.address.trim(),
      representativeName: formState.representativeName.trim(),
      representativeRelation: formState.representativeRelation.trim(),
      representativePhone: formatPhoneNumberInput(formState.representativePhone.trim()),
      serviceType: formState.serviceType,
      caregiverRequirements: formState.caregiverRequirements.trim(),
      reductionType: formState.reductionType,
      relatedPeople: formState.relatedPeople.trim(),
      serviceStartDate: formState.serviceStartDate,
      serviceEndDate: formState.serviceEndDate,
      contractRegisteredDate: formState.serviceStartDate,
      contractExpiredDate: formState.serviceEndDate,
      enabled: recipientBeingEdited?.enabled ?? true
    };

    setIsSaving(true);

    try {
      const savedRecipient = recipientBeingEdited
        ? await updateRecipient(recipientToSave)
        : await createRecipient(recipientToSave);
      setRecipients((current) => recipientBeingEdited
        ? current.map((recipient) => recipient.id === savedRecipient.id ? savedRecipient : recipient)
        : [...current, savedRecipient]);
      setSelectedRecipientId(savedRecipient.id);
      showNotification(
        recipientBeingEdited
          ? "수급자 정보를 저장하였습니다."
          : "수급자 추가가 완료되었습니다"
      );
      closeCreatePanel();
      setErrorMessage(null);
    } catch (error) {
      setFormErrorMessage(
        error instanceof Error ? error.message : "수급자 정보를 저장하지 못했습니다."
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleQuickCreateRecipient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const requiredQuickFields: Array<keyof RecipientFormState> = [
      "name", "operationalName", "birthDate", "longTermCareNumber", "careGrade", "address", "serviceStartDate", "serviceEndDate"
    ];

    if (requiredQuickFields.some((field) => !formState[field].trim())) {
      setFormErrorMessage("간단 추가의 필수 항목을 모두 입력하세요.");
      return;
    }

    if (formState.serviceStartDate > formState.serviceEndDate) {
      setFormErrorMessage("장기요양이용계약 시작일은 만료일보다 늦을 수 없습니다.");
      return;
    }

    setIsSaving(true);
    try {
      const createdRecipient = await createRecipient({
        id: createRecipientId(),
        name: formState.name.trim(),
        operationalName: formState.operationalName.trim(),
        birthDate: formState.birthDate,
        longTermCareNumber: formState.longTermCareNumber.trim(),
        careGrade: formState.careGrade,
        address: formState.address.trim(),
        representativeName: "미등록",
        representativeRelation: "미등록",
        representativePhone: "미등록",
        serviceType: formState.serviceType,
        caregiverRequirements: formState.caregiverRequirements.trim(),
        reductionType: formState.reductionType,
        relatedPeople: formState.relatedPeople.trim(),
        serviceStartDate: formState.serviceStartDate,
        serviceEndDate: formState.serviceEndDate,
        contractRegisteredDate: formState.serviceStartDate,
        contractExpiredDate: formState.serviceEndDate,
        enabled: true
      });
      setRecipients((current) => [...current, createdRecipient]);
      setFormState(emptyRecipientForm);
      setFormErrorMessage(null);
      setIsQuickAddOpen(false);
      setSelectedRecipientId(createdRecipient.id);
      showNotification("수급자 추가가 완료되었습니다");
    } catch (error) {
      setFormErrorMessage(error instanceof Error ? error.message : "수급자를 추가하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleOperationalNameUpdate = async () => {
    if (!selectedRecipient) return;

    const operationalName = operationalNameDraft.trim();
    if (!operationalName) {
      setOperationalNameSaveMessage({ type: "error", text: "업무식별명을 입력하세요." });
      return;
    }

    setIsSaving(true);
    setOperationalNameSaveMessage(null);
    try {
      const updated = await updateRecipient({
        ...selectedRecipient,
        operationalName
      });
      if (updated.operationalName !== operationalName) {
        throw new Error("업무식별명이 서버 응답에 반영되지 않았습니다. API 서버를 재시작해 주세요.");
      }
      setRecipients((current) => current.map((recipient) => recipient.id === updated.id ? updated : recipient));
      setOperationalNameDraft(updated.operationalName);
      setOperationalNameSaveMessage({ type: "success", text: "업무식별명을 저장했습니다." });
      showNotification("수급자 정보를 저장하였습니다.");
      setErrorMessage(null);
    } catch (error) {
      setOperationalNameSaveMessage({
        type: "error",
        text: error instanceof Error ? error.message : "업무식별명을 저장하지 못했습니다."
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateBackofficeUser = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!newBackofficeUserName.trim() || !newBackofficeUserBirthDate) {
      setBackofficeUserError("이름과 생년월일을 모두 입력하세요.");
      return;
    }

    setIsBackofficeUserSaving(true);
    try {
      const created = await createBackofficeUser({
        id: createBackofficeUserId(),
        name: newBackofficeUserName.trim(),
        birthDate: newBackofficeUserBirthDate
      });
      setBackofficeUsers((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)));
      setNewBackofficeUserName("");
      setNewBackofficeUserBirthDate("");
      setIsBackofficeUserFormOpen(false);
      setBackofficeUserError(null);
      showNotification("백오피스 사용자를 생성하였습니다.");
    } catch (error) {
      setBackofficeUserError(error instanceof Error ? error.message : "사용자를 생성하지 못했습니다.");
    } finally {
      setIsBackofficeUserSaving(false);
    }
  };

  const handleActivateBackofficeUser = async (user: BackofficeUser) => {
    setIsBackofficeUserSaving(true);
    try {
      const state = await activateBackofficeUser(deviceId, {
        userId: user.id,
        deviceName: window.location.host || "백오피스 기기"
      });
      window.localStorage.setItem("miso-backoffice-active-user-id", user.id);
      setActiveBackofficeUserId(user.id);
      setBackofficeUsers(state.users);
      setBackofficeSessions(state.sessions);
      setIsBackofficeUserModalOpen(false);
      setBackofficeUserError(null);
      showNotification(`${user.name} 사용자로 전환하였습니다.`);
    } catch (error) {
      setBackofficeUserError(error instanceof Error ? error.message : "사용자를 활성화하지 못했습니다.");
    } finally {
      setIsBackofficeUserSaving(false);
    }
  };

  const handleAssignedBackofficeUserUpdate = async (userId: string) => {
    if (!selectedRecipient) return;
    setIsSaving(true);
    try {
      const updated = await updateRecipient({ ...selectedRecipient, assignedBackofficeUserId: userId || undefined });
      setRecipients((current) => current.map((recipient) => recipient.id === updated.id ? updated : recipient));
      showNotification("수급자 정보를 저장하였습니다.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "담당 사회복지사를 저장하지 못했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateEmploymentContract = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const missingField = requiredEmploymentContractFields.find(({ key }) => {
      const value = employmentFormState[key];
      return typeof value !== "string" || !value.trim();
    });

    if (missingField) {
      setEmploymentFormErrorMessage(`${missingField.label}을(를) 입력하세요.`);
      return;
    }

    const derivedWorkerBirthDate = deriveBirthDateFromResidentNumber(
      employmentFormState.residentRegistrationNumber
    );

    if (!derivedWorkerBirthDate) {
      setEmploymentFormErrorMessage("주민번호 앞 7자리를 확인하세요.");
      return;
    }

    const contractTerms = employmentFormState.terms.map((term) => ({
      wageType: term.wageType,
      wageAmount: Number(term.wageAmount),
      nonTaxableMealAllowance: Number(term.nonTaxableMealAllowance || 0),
      nonTaxableVehicleAllowance: Number(term.nonTaxableVehicleAllowance || 0),
      otherNonTaxablePay: Number(term.otherNonTaxablePay || 0)
    }));

    const invalidTermIndex = contractTerms.findIndex(
      (term) =>
        !Number.isFinite(term.wageAmount) ||
        term.wageAmount <= 0 ||
        [term.nonTaxableMealAllowance, term.nonTaxableVehicleAllowance, term.otherNonTaxablePay].some(
          (value) => !Number.isFinite(value) || value < 0
        )
    );

    if (invalidTermIndex >= 0) {
      setEmploymentFormErrorMessage(
        `${invalidTermIndex + 1}번째 계약 조건의 금액을 확인하세요.`
      );
      return;
    }

    const firstTerm = contractTerms[0];

    const newContract: EmploymentContractInput = {
      id: createEmploymentContractId(),
      workerName: employmentFormState.workerName.trim(),
      workerBirthDate: derivedWorkerBirthDate,
      residentRegistrationNumber: formatResidentNumberInput(
        employmentFormState.residentRegistrationNumber.trim()
      ),
      ...(employmentFormState.workerPhone.trim()
        ? { workerPhone: formatPhoneNumberInput(employmentFormState.workerPhone.trim()) }
        : {}),
      primaryBank: employmentFormState.primaryBank.trim(),
      bankAccountNumber: formatBankAccountNumberInput(employmentFormState.bankAccountNumber.trim()),
      workerAddress: "미입력",
      jobTitle: "근로자",
      employmentType: "근로계약 묶음",
      workplaceType: "office",
      workplace: "미입력",
      recipientAssignments: [],
      contractStartDate: new Date().toISOString().slice(0, 10),
      workDays: "미입력",
      workStartTime: "09:00",
      workEndTime: "18:00",
      breakMinutes: 0,
      wageType: firstTerm.wageType,
      wageAmount: firstTerm.wageAmount,
      nonTaxableVehicleAllowance: firstTerm.nonTaxableVehicleAllowance,
      nonTaxableMealAllowance: firstTerm.nonTaxableMealAllowance,
      taxableExtraPay: firstTerm.otherNonTaxablePay,
      paymentDate: "미입력",
      insuranceStatus: "별도 관리",
      insuranceSnapshots: [],
      contractTerms,
      enabled: true
    };

    setIsEmploymentSaving(true);

    try {
      const createdContract = await createEmploymentContract(newContract);
      setEmploymentContracts((current) => [...current, createdContract]);
      setSelectedEmploymentContractId(createdContract.id);
      closeEmploymentCreatePanel();
      setEmploymentErrorMessage(null);
    } catch (error) {
      setEmploymentFormErrorMessage(
        error instanceof Error ? error.message : "근로계약 정보를 저장하지 못했습니다."
      );
    } finally {
      setIsEmploymentSaving(false);
    }
  };

  const handleRecipientCsvUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const rows = await readCsvFile(file);

      if (rows.length === 0) {
        throw new Error("CSV에 등록할 수급자 행이 없습니다.");
      }

      const createdRecipients: Recipient[] = [];

      for (const [index, row] of rows.entries()) {
        const rowNumber = index + 2;
        const serviceStartDate = requireCsvValue(row, "serviceStartDate");
        const serviceEndDate = requireCsvValue(row, "serviceEndDate");

        if (serviceStartDate > serviceEndDate) {
          throw new Error(`${rowNumber}행: serviceStartDate는 serviceEndDate보다 늦을 수 없습니다.`);
        }

        const recipientInput: RecipientInput = {
          id: row.id || createRecipientId(),
          name: requireCsvValue(row, "name"),
          ...(row.operationalName?.trim() ? { operationalName: row.operationalName.trim() } : {}),
          birthDate: requireCsvValue(row, "birthDate"),
          longTermCareNumber: requireCsvValue(row, "longTermCareNumber"),
          careGrade: requireCsvValue(row, "careGrade"),
          ...(row.phone ? { phone: formatPhoneNumberInput(row.phone) } : {}),
          address: requireCsvValue(row, "address"),
          representativeName: requireCsvValue(row, "representativeName"),
          representativeRelation: requireCsvValue(row, "representativeRelation"),
          representativePhone: formatPhoneNumberInput(requireCsvValue(row, "representativePhone")),
          serviceType: row.serviceType === "가족" ? "가족" : "방문",
          caregiverRequirements: row.caregiverRequirements?.trim() ?? "",
          reductionType: row.reductionType === "감경" || row.reductionType === "기초" ? row.reductionType : "일반",
          relatedPeople: row.relatedPeople?.trim() ?? "",
          serviceStartDate,
          serviceEndDate,
          contractRegisteredDate: serviceStartDate,
          contractExpiredDate: serviceEndDate,
          enabled: parseCsvBoolean(row.enabled, false)
        };

        createdRecipients.push(await createRecipient(recipientInput));
      }

      setRecipients((current) => [...current, ...createdRecipients]);
      setShowEnabledOnly(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "수급자 CSV 업로드에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEmploymentContractCsvUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    setIsEmploymentSaving(true);
    setEmploymentErrorMessage(null);

    try {
      const rows = await readCsvFile(file);

      if (rows.length === 0) {
        throw new Error("CSV에 등록할 근로계약 행이 없습니다.");
      }

      const groupedRows = rows.reduce<Map<string, CsvRow[]>>((groups, row, index) => {
        const workerGroupId =
          row.workerGroupId?.trim() ||
          `${row.workerName?.trim() ?? "worker"}-${row.residentRegistrationNumber?.trim() ?? index}`;
        const groupRows = groups.get(workerGroupId) ?? [];
        groupRows.push(row);
        groups.set(workerGroupId, groupRows);
        return groups;
      }, new Map<string, CsvRow[]>());
      const createdContracts: EmploymentContract[] = [];

      for (const [workerGroupId, groupRows] of groupedRows.entries()) {
        const firstRow = groupRows[0];
        const residentRegistrationNumber = formatResidentNumberInput(
          requireCsvValue(firstRow, "residentRegistrationNumber")
        );
        const workerBirthDate = deriveBirthDateFromResidentNumber(residentRegistrationNumber);

        if (!workerBirthDate) {
          throw new Error(`${workerGroupId}: 주민번호 앞 7자리를 확인하세요.`);
        }

        const contractTerms = groupRows
          .sort((a, b) => Number(a.termOrder || 0) - Number(b.termOrder || 0))
          .map((row, index) => {
            const wageType = requireCsvValue(row, "wageType");

            if (!["월급", "시급"].includes(wageType)) {
              throw new Error(`${workerGroupId} ${index + 1}번째 계약: wageType은 월급 또는 시급이어야 합니다.`);
            }

            return {
              wageType: wageType as "월급" | "시급",
              wageAmount: parseCsvNumber(row.wageAmount, "wageAmount"),
              nonTaxableMealAllowance: parseCsvNumber(
                row.nonTaxableMealAllowance || "0",
                "nonTaxableMealAllowance"
              ),
              nonTaxableVehicleAllowance: parseCsvNumber(
                row.nonTaxableVehicleAllowance || "0",
                "nonTaxableVehicleAllowance"
              ),
              otherNonTaxablePay: parseCsvNumber(row.otherNonTaxablePay || "0", "otherNonTaxablePay")
            };
          });
        const firstTerm = contractTerms[0];
        const contractInput: EmploymentContractInput = {
          id: workerGroupId || createEmploymentContractId(),
          workerName: requireCsvValue(firstRow, "workerName"),
          workerBirthDate,
          residentRegistrationNumber,
          workerPhone: formatPhoneNumberInput(requireCsvValue(firstRow, "workerPhone")),
          primaryBank: requireCsvValue(firstRow, "primaryBank"),
          bankAccountNumber: formatBankAccountNumberInput(requireCsvValue(firstRow, "bankAccountNumber")),
          workerAddress: "미입력",
          jobTitle: "근로자",
          employmentType: "근로계약 묶음",
          workplaceType: "office",
          workplace: "미입력",
          recipientAssignments: [],
          contractStartDate: new Date().toISOString().slice(0, 10),
          workDays: "미입력",
          workStartTime: "09:00",
          workEndTime: "18:00",
          breakMinutes: 0,
          wageType: firstTerm.wageType,
          wageAmount: firstTerm.wageAmount,
          nonTaxableVehicleAllowance: firstTerm.nonTaxableVehicleAllowance,
          nonTaxableMealAllowance: firstTerm.nonTaxableMealAllowance,
          taxableExtraPay: firstTerm.otherNonTaxablePay,
          paymentDate: "미입력",
          insuranceStatus: "별도 관리",
          insuranceSnapshots: [],
          contractTerms,
          enabled: parseCsvBoolean(firstRow.enabled, false)
        };

        createdContracts.push(await createEmploymentContract(contractInput));
      }

      setEmploymentContracts((current) => [...current, ...createdContracts]);
      setShowEnabledEmploymentOnly(false);
    } catch (error) {
      setEmploymentErrorMessage(
        error instanceof Error ? error.message : "근로계약 CSV 업로드에 실패했습니다."
      );
    } finally {
      setIsEmploymentSaving(false);
    }
  };

  const handleDeactivateRecipient = async () => {
    if (!recipientToDeactivate) {
      return;
    }

    setIsDeactivating(true);
    setDeactivateErrorMessage(null);

    try {
      await deleteRecipient(recipientToDeactivate.id);
      setRecipients((current) =>
        current.filter((recipient) => recipient.id !== recipientToDeactivate.id)
      );
      setSelectedRecipientId(null);
      setRecipientToDeactivate(null);
      showNotification("수급자 정보를 삭제하였습니다.");
      setErrorMessage(null);
    } catch (error) {
      setDeactivateErrorMessage(
        error instanceof Error ? error.message : "수급자 정보를 삭제하지 못했습니다."
      );
    } finally {
      setIsDeactivating(false);
    }
  };

  const handleDeactivateEmploymentContract = async () => {
    if (!employmentContractToDeactivate) {
      return;
    }

    setIsEmploymentDeactivating(true);
    setEmploymentDeactivateErrorMessage(null);

    try {
      const updatedContract = await updateEmploymentContract({
        ...employmentContractToDeactivate,
        enabled: false
      });

      setEmploymentContracts((current) =>
        current.map((contract) =>
          contract.id === updatedContract.id ? updatedContract : contract
        )
      );
      setSelectedEmploymentContractId(updatedContract.id);
      setEmploymentContractToDeactivate(null);
      setEmploymentErrorMessage(null);
    } catch (error) {
      setEmploymentDeactivateErrorMessage(
        error instanceof Error ? error.message : "근로계약을 비활성화하지 못했습니다."
      );
    } finally {
      setIsEmploymentDeactivating(false);
    }
  };

  const openTerminateDialog = (recipient: Recipient) => {
    setRecipientToTerminate(recipient);
    setTerminationExpiredDate(recipient.serviceEndDate);
    setTerminationErrorMessage(null);
  };

  const closeTerminateDialog = () => {
    setRecipientToTerminate(null);
    setTerminationExpiredDate("");
    setTerminationErrorMessage(null);
  };

  const handleTerminateContract = async () => {
    if (!recipientToTerminate) {
      return;
    }

    if (!terminationExpiredDate) {
      setTerminationErrorMessage("장기요양이용계약 만료일을 입력하세요.");
      return;
    }

    if (terminationExpiredDate < recipientToTerminate.serviceStartDate) {
      setTerminationErrorMessage("장기요양이용계약 만료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    setIsTerminating(true);
    setTerminationErrorMessage(null);

    try {
      const updatedRecipient = await terminateContract(recipientToTerminate.id, {
        contractExpiredDate: terminationExpiredDate
      });

      setRecipients((current) =>
        current.map((recipient) =>
          recipient.id === updatedRecipient.id ? updatedRecipient : recipient
        )
      );
      setSelectedRecipientId(updatedRecipient.id);
      closeTerminateDialog();
      showNotification("수급자 정보를 저장하였습니다.");
      setErrorMessage(null);
    } catch (error) {
      setTerminationErrorMessage(
        error instanceof Error ? error.message : "계약해지 정보를 저장하지 못했습니다."
      );
    } finally {
      setIsTerminating(false);
    }
  };

  const openRestoreDialog = (recipient: Recipient) => {
    setRecipientToRestore(recipient);
    setRestoreFormState({
      restoreType: "paused_return",
      documentsConfirmed: false,
      serviceStartDate: recipient.serviceStartDate,
      serviceEndDate: recipient.serviceEndDate,
      contractRegisteredDate: recipient.contractRegisteredDate,
      contractExpiredDate: recipient.contractExpiredDate,
      memo: ""
    });
    setRestoreErrorMessage(null);
  };

  const closeRestoreDialog = () => {
    setRecipientToRestore(null);
    setRestoreFormState(null);
    setRestoreErrorMessage(null);
  };

  const updateRestoreField = <Key extends keyof RestoreFormState>(
    field: Key,
    value: RestoreFormState[Key]
  ) => {
    const nextValue =
      typeof value === "string" && ["serviceStartDate", "serviceEndDate"].includes(field)
        ? limitDateYear(value)
        : value;
    setRestoreFormState((current) => (current ? { ...current, [field]: nextValue } : current));
    setRestoreErrorMessage(null);
  };

  const handleRestoreRecipient = async () => {
    if (!recipientToRestore || !restoreFormState) {
      return;
    }

    if (!restoreFormState.documentsConfirmed) {
      setRestoreErrorMessage("장기요양급여 제공 내용을 확인해야 합니다.");
      return;
    }

    if (restoreFormState.restoreType === "recontracted") {
      const requiredDates = [
        restoreFormState.serviceStartDate,
        restoreFormState.serviceEndDate
      ];

      if (requiredDates.some((value) => !value)) {
        setRestoreErrorMessage("재계약 날짜 정보를 모두 입력하세요.");
        return;
      }

      if (restoreFormState.serviceStartDate > restoreFormState.serviceEndDate) {
        setRestoreErrorMessage("장기요양이용계약 시작일은 만료일보다 늦을 수 없습니다.");
        return;
      }
    }

    setIsRestoring(true);
    setRestoreErrorMessage(null);

    try {
      const updatedRecipient = await restoreRecipient(recipientToRestore.id, {
        restoreType: restoreFormState.restoreType,
        documentsConfirmed: restoreFormState.documentsConfirmed,
        ...(restoreFormState.restoreType === "recontracted"
          ? {
              serviceStartDate: restoreFormState.serviceStartDate,
              serviceEndDate: restoreFormState.serviceEndDate,
              contractRegisteredDate: restoreFormState.serviceStartDate,
              contractExpiredDate: restoreFormState.serviceEndDate
            }
          : {}),
        memo: restoreFormState.memo.trim() || undefined
      });

      setRecipients((current) =>
        current.map((recipient) =>
          recipient.id === updatedRecipient.id ? updatedRecipient : recipient
        )
      );
      setSelectedRecipientId(updatedRecipient.id);
      closeRestoreDialog();
      showNotification("수급자 정보를 저장하였습니다.");
      setErrorMessage(null);
    } catch (error) {
      setRestoreErrorMessage(
        error instanceof Error ? error.message : "계약복구 정보를 저장하지 못했습니다."
      );
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="app-shell">
      {notification && (
        <div key={notification.id} className="top-notification" role="status" aria-live="polite">
          <ClipboardCheck size={19} aria-hidden="true" />
          <span>{notification.message}</span>
        </div>
      )}
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <Users size={22} />
          </span>
          <div>
            <strong>Miso Backoffice</strong>
            <span>운영 정보 관리 MVP</span>
          </div>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="backoffice-user-button"
            onClick={() => { setIsBackofficeUserModalOpen(true); setBackofficeUserError(null); }}
          >
            <UserRound size={17} />
            백오피스 사용자
          </button>
          {activeBackofficeUser && (
            <button type="button" className="active-user-card" onClick={() => setIsBackofficeUserModalOpen(true)}>
              <span>{activeBackofficeUser.name}</span>
              <i aria-label="접속 중" />
            </button>
          )}
          <nav className="view-tabs" aria-label="관리 메뉴">
            <button
              type="button"
              className={activeView === "recipients" ? "is-active" : ""}
              onClick={() => {
                setActiveView("recipients");
                setSelectedEmploymentContractId(null);
                setIsEmploymentCreatePanelOpen(false);
              }}
            >
              <Users size={16} />
              수급자
            </button>
            <button
              type="button"
              className={activeView === "employmentContracts" ? "is-active" : ""}
              onClick={() => {
                setActiveView("employmentContracts");
                setSelectedRecipientId(null);
                setIsCreatePanelOpen(false);
              }}
            >
              <Briefcase size={16} />
              근로계약
            </button>
          </nav>
          <div className="runtime-badge">
            <Database size={16} />
            로컬 SQLite
          </div>
        </div>
      </header>

      <main className="main-content">
        {activeView === "recipients" ? (
          <>
        <section className="page-heading">
          <div>
            <span className="eyebrow">Recipients</span>
            <h1>수급자 관리</h1>
            <p>기본 정보와 장기요양이용계약 기간을 기록하고 확인합니다.</p>
          </div>
          <div className="heading-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={downloadRecipientCsvExample}
            >
              <Download size={18} />
              CSV 예제
            </button>
            <label className="secondary-button">
              <Upload size={18} />
              CSV 업로드
              <input
                className="sr-only"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void handleRecipientCsvUpload(event)}
              />
            </label>
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setSelectedRecipientId(null);
                setIsQuickAddOpen((current) => !current);
              }}
            >
              <Plus size={18} />
              간단 추가
            </button>
            <div className="summary-card">
              <span>관리 중 · 갱신 확인</span>
              <strong>{enabledRecipientCount}명 <small>{renewalCount}건</small></strong>
            </div>
          </div>
        </section>

        {errorMessage && (
          <div className="error-banner" role="alert">
            <AlertTriangle size={20} />
            <div>
              <strong>API 서버 연결을 확인하세요.</strong>
              <p>{errorMessage}</p>
            </div>
            <button type="button" className="icon-button" onClick={() => void fetchRecipients()}>
              <RefreshCw size={18} />
              <span className="sr-only">다시 시도</span>
            </button>
          </div>
        )}

        {isQuickAddOpen && (
          <form className="quick-add-card" onSubmit={handleQuickCreateRecipient}>
            <div className="quick-add-heading">
              <div><strong>수급자 간단 추가</strong><span>필수 정보만 먼저 등록하고 상세 정보는 나중에 보완할 수 있어요.</span></div>
              <button type="button" className="icon-button" onClick={() => setIsQuickAddOpen(false)}><X size={18} /></button>
            </div>
            <div className="quick-add-grid">
              <label><span>이름</span><input value={formState.name} onChange={(event) => updateFormField("name", event.target.value)} required autoFocus /></label>
              <label className="quick-identifier-field"><span>업무식별명</span><input value={formState.operationalName} onChange={(event) => updateFormField("operationalName", event.target.value)} placeholder="정성춘/3/함평군/파킨슨" required /></label>
              <label><span>생년월일</span><input type="date" {...dateInputLimits} value={formState.birthDate} onChange={(event) => updateFormField("birthDate", event.target.value)} required /></label>
              <label><span>인정번호</span><input value={formState.longTermCareNumber} onChange={(event) => updateFormField("longTermCareNumber", event.target.value)} required /></label>
              <label><span>등급</span><select value={formState.careGrade} onChange={(event) => updateFormField("careGrade", event.target.value)}>{["1등급","2등급","3등급","4등급","5등급","인지지원등급"].map((grade) => <option key={grade}>{grade}</option>)}</select></label>
              <label className="quick-address-field"><span>수급자 주소</span><input value={formState.address} onChange={(event) => updateFormField("address", event.target.value)} placeholder="예: 광주광역시 광산구 신창동" required /></label>
              <label><span>장기요양이용계약 시작일</span><input type="date" {...dateInputLimits} value={formState.serviceStartDate} onChange={(event) => updateFormField("serviceStartDate", event.target.value)} required /></label>
              <label><span>장기요양이용계약 만료일</span><input type="date" {...dateInputLimits} value={formState.serviceEndDate} onChange={(event) => updateFormField("serviceEndDate", event.target.value)} required /></label>
            </div>
            {formErrorMessage && <p className="quick-error">{formErrorMessage}</p>}
            <div className="quick-add-actions">
              <button type="button" className="secondary-button" onClick={() => { setIsQuickAddOpen(false); setEditingRecipientId(null); setIsCreatePanelOpen(true); }}>상세 입력</button>
              <button className="primary-button" disabled={isSaving}><Save size={17} />{isSaving ? "저장 중" : "바로 저장"}</button>
            </div>
          </form>
        )}

        <section aria-labelledby="recipient-list-title">
          <div className="list-toolbar">
            <div>
              <h2 id="recipient-list-title">수급자 목록</h2>
              <span>장기요양이용계약 만료일 오름차순</span>
            </div>
            <div className="toolbar-controls">
              <select className="filter-select" aria-label="담당 근무자 필터" value={selectedWorkerId} onChange={(event) => setSelectedWorkerId(event.target.value)}>
                <option value="all">담당자 전체</option>
                {activeWorkers.map((worker) => <option key={worker.id} value={worker.id}>{worker.workerName} · {worker.recipientAssignments.length}명</option>)}
              </select>
              <select className="filter-select" aria-label="계약 상태 필터" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as RecipientStatus | "전체")}>
                {(["전체", "급여시작", "급여제공중", "급여갱신필요", "계약종료예정", "계약종료"] as const).map((status) => <option key={status} value={status}>{status === "전체" ? "상태 전체" : status}</option>)}
              </select>
              <div className="density-toggle" aria-label="보기 방식">
                <button type="button" className={viewDensity === "simple" ? "is-active" : ""} onClick={() => setViewDensity("simple")}>간단</button>
                <button type="button" className={viewDensity === "detail" ? "is-active" : ""} onClick={() => setViewDensity("detail")}>상세</button>
              </div>
              <label className="valid-toggle">
                <input
                  type="checkbox"
                  checked={showEnabledOnly}
                  onChange={(event) => setShowEnabledOnly(event.target.checked)}
                />
                <span>유효함</span>
              </label>
              <label className="search-box">
                <Search size={18} />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="이름, 인정번호, 연락처 검색"
                />
              </label>
            </div>
          </div>

          {isLoading ? (
            <div className="empty-state">
              <RefreshCw className="spin" size={28} />
              <p>수급자 정보를 불러오는 중입니다.</p>
            </div>
          ) : filteredRecipients.length === 0 ? (
            <div className="empty-state">
              <Users size={30} />
              <p>{searchQuery ? "검색 결과가 없습니다." : "표시할 수급자가 없습니다."}</p>
            </div>
          ) : (
            <div className={`recipient-table ${viewDensity === "simple" ? "is-simple" : ""}`}>
              <div className="table-head">
                {viewDensity === "simple" ? (
                  <>
                    <span>수급자</span><span>상태</span><span>수급자 주소</span><span>주요 연락처</span><span>담당 사회복지사</span>
                  </>
                ) : (
                  <>
                    <span>수급자</span><span>등급</span><span>상태</span><span>대표 연락자</span><span>이용계약 만료일</span>
                  </>
                )}
                <span>{viewDensity === "simple" ? "관리" : ""}</span>
              </div>
              <ul>
                {filteredRecipients.map((recipient) => (
                  <li key={recipient.id}>
                    <div
                      className={`recipient-row ${
                        isRecipientEnabled(recipient) ? "" : "is-disabled"
                      }`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedRecipientId(recipient.id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedRecipientId(recipient.id);
                        }
                      }}
                    >
                      <span className="recipient-name">
                        <strong>{recipient.name}</strong>
                        <small>
                          {viewDensity === "simple" ? getRecipientDisplayId(recipient) : recipient.longTermCareNumber}
                          {!isRecipientEnabled(recipient) && (
                            <em className="status-chip">비활성화</em>
                          )}
                        </small>
                      </span>
                      {viewDensity === "simple" ? (
                        <>
                          <span><em className={`contract-status status-${getRecipientStatus(recipient)}`}>{getRecipientStatus(recipient)}</em></span>
                          <span className="recipient-address">{recipient.address === "미등록" ? "주소 미등록" : recipient.address}</span>
                          <span className="primary-contact">
                            <strong>{hasPrimaryContact(recipient) ? `${recipient.representativeName}(${recipient.representativeRelation})` : "연락처 미등록"}</strong>
                            <small>{hasPrimaryContact(recipient) ? recipient.representativePhone : "상세 정보에서 등록해 주세요"}</small>
                          </span>
                          <span className="assigned-worker">
                            {getAssignedSocialWorkerNames(recipient.id).length > 0
                              ? getAssignedSocialWorkerNames(recipient.id).join(", ")
                              : "미배정"}
                          </span>
                        </>
                      ) : (
                        <>
                          <span>{recipient.careGrade}</span>
                          <span><em className={`contract-status status-${getRecipientStatus(recipient)}`}>{getRecipientStatus(recipient)}</em></span>
                          <span>{recipient.representativeName}<small>{recipient.representativePhone}</small></span>
                          <span className="expiry"><CalendarClock size={15} />{recipient.serviceEndDate}</span>
                        </>
                      )}
                      {viewDensity === "simple" ? (
                        <div className="row-actions" aria-label={`${recipient.name} 관리`}>
                          <button
                            type="button"
                            className="row-icon-button"
                            aria-label={`${recipient.name} 수정`}
                            title="수정"
                            onClick={(event) => {
                              event.stopPropagation();
                              openRecipientEditPanel(recipient);
                            }}
                          >
                            <Pencil size={17} />
                          </button>
                          <button
                            type="button"
                            className="row-icon-button is-danger"
                            aria-label={`${recipient.name} 삭제`}
                            title="삭제"
                            onClick={(event) => {
                              event.stopPropagation();
                              setRecipientToDeactivate(recipient);
                              setDeactivateErrorMessage(null);
                            }}
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                      ) : (
                        <ChevronRight size={18} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
          </>
        ) : (
          <>
            <section className="page-heading">
              <div>
                <span className="eyebrow">Employment contracts</span>
                <h1>근로계약 관리</h1>
                <p>근로자의 계약 기간, 근무시간, 임금과 보험 정보를 기록하고 확인합니다.</p>
              </div>
              <div className="heading-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={downloadEmploymentContractCsvExample}
                >
                  <Download size={18} />
                  CSV 예제
                </button>
                <label className="secondary-button">
                  <Upload size={18} />
                  CSV 업로드
                  <input
                    className="sr-only"
                    type="file"
                    accept=".csv,text/csv"
                    onChange={(event) => void handleEmploymentContractCsvUpload(event)}
                  />
                </label>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setSelectedEmploymentContractId(null);
                    setIsEmploymentCreatePanelOpen(true);
                  }}
                >
                  <Plus size={18} />
                  근로계약 등록
                </button>
                <div className="summary-card">
                  <span>유효 계약</span>
                  <strong>{enabledEmploymentContractCount}건</strong>
                </div>
              </div>
            </section>

            {employmentErrorMessage && (
              <div className="error-banner" role="alert">
                <AlertTriangle size={20} />
                <div>
                  <strong>API 서버 연결을 확인하세요.</strong>
                  <p>{employmentErrorMessage}</p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => void fetchEmploymentContracts()}
                >
                  <RefreshCw size={18} />
                  <span className="sr-only">다시 시도</span>
                </button>
              </div>
            )}

            <section aria-labelledby="employment-contract-list-title">
              <div className="list-toolbar">
                <div>
                  <h2 id="employment-contract-list-title">근로계약 목록</h2>
                  <span>계약 시작일 최신순</span>
                </div>
                <div className="toolbar-controls">
                  <label className="valid-toggle">
                    <input
                      type="checkbox"
                      checked={showEnabledEmploymentOnly}
                      onChange={(event) => setShowEnabledEmploymentOnly(event.target.checked)}
                    />
                    <span>유효함</span>
                  </label>
                  <label className="search-box">
                    <Search size={18} />
                    <input
                      type="search"
                      value={employmentSearchQuery}
                      onChange={(event) => setEmploymentSearchQuery(event.target.value)}
                      placeholder="이름, 주민번호, 전화번호 검색"
                    />
                  </label>
                </div>
              </div>

              {isEmploymentLoading ? (
                <div className="empty-state">
                  <RefreshCw className="spin" size={28} />
                  <p>근로계약 정보를 불러오는 중입니다.</p>
                </div>
              ) : filteredEmploymentContracts.length === 0 ? (
                <div className="empty-state">
                  <Briefcase size={30} />
                  <p>{employmentSearchQuery ? "검색 결과가 없습니다." : "표시할 근로계약이 없습니다."}</p>
                </div>
              ) : (
                <div className="recipient-table employment-table">
                  <div className="table-head">
                    <span>근로자</span>
                    <span>주민번호</span>
                    <span>전화번호</span>
                    <span>계약 조건</span>
                    <span>대표 금액</span>
                    <span aria-hidden="true" />
                  </div>
                  <ul>
                    {filteredEmploymentContracts.map((contract) => (
                      <li key={contract.id}>
                        <button
                          type="button"
                          className={`recipient-row ${contract.enabled ? "" : "is-disabled"}`}
                          onClick={() => setSelectedEmploymentContractId(contract.id)}
                        >
                          <span className="recipient-name">
                            <strong>{contract.workerName}</strong>
                            <small>
                              {contract.workerPhone ?? "연락처 미등록"}
                              {!contract.enabled && <em className="status-chip">비활성화</em>}
                            </small>
                          </span>
                          <span>{contract.residentRegistrationNumber}</span>
                          <span>{contract.workerPhone ?? "미등록"}</span>
                          <span>
                            {contract.contractTerms.length || 1}개
                            <small>{formatContractTerms(contract).split("\n")[0]}</small>
                          </span>
                          <span className="expiry">
                            {formatCurrency(contract.contractTerms[0]?.wageAmount ?? contract.wageAmount)}
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {selectedRecipient && (
        <div className="detail-backdrop" role="presentation">
          <article
            className={`detail-panel ${
              isRecipientEnabled(selectedRecipient) ? "" : "is-disabled-detail"
            }`}
            aria-label={`${selectedRecipient.name} 상세 정보`}
          >
            <div className="detail-header">
              <button
                type="button"
                className="back-button"
                onClick={() => setSelectedRecipientId(null)}
              >
                <ArrowLeft size={17} />
                목록으로
              </button>
              <div className="detail-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => openRecipientEditPanel(selectedRecipient)}
                >
                  <Pencil size={17} />
                  전체 정보 수정
                </button>
                {isRecipientEnabled(selectedRecipient) ? (
                  <>
                    <button
                      type="button"
                      className="warning-button"
                      onClick={() => openTerminateDialog(selectedRecipient)}
                    >
                      <FileX2 size={17} />
                      계약해지
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      onClick={() => {
                        setRecipientToDeactivate(selectedRecipient);
                        setDeactivateErrorMessage(null);
                      }}
                    >
                      <Trash2 size={17} />
                      수급자 삭제
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="restore-button"
                    onClick={() => openRestoreDialog(selectedRecipient)}
                  >
                    <RotateCcw size={17} />
                    계약복구
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setSelectedRecipientId(null)}
                >
                  <X size={20} />
                  <span className="sr-only">닫기</span>
                </button>
              </div>
            </div>

            <div className="recipient-hero">
              <span>{selectedRecipient.longTermCareNumber}</span>
              <h2>{selectedRecipient.name}</h2>
              <p>
                {selectedRecipient.careGrade} · 대표 연락자{" "}
                {selectedRecipient.representativeName}
                {!isRecipientEnabled(selectedRecipient) && (
                  <strong className="inactive-inline">비활성화된 수급자</strong>
                )}
              </p>
              <div>
                <small>장기요양이용계약 만료일</small>
                <strong>{formatDate(selectedRecipient.serviceEndDate)}</strong>
              </div>
            </div>

            <form className="operational-name-editor" onSubmit={(event) => { event.preventDefault(); void handleOperationalNameUpdate(); }}>
              <label>
                <span>업무식별명</span>
                <input value={operationalNameDraft} onChange={(event) => { setOperationalNameDraft(event.target.value); setOperationalNameSaveMessage(null); }} placeholder="정성춘/3/함평군/파킨슨" required />
              </label>
              <button type="submit" className="secondary-button" disabled={isSaving}>
                <Save size={16} /> {isSaving ? "저장 중" : "저장"}
              </button>
              {operationalNameSaveMessage && (
                <p className={`inline-save-message is-${operationalNameSaveMessage.type}`} role={operationalNameSaveMessage.type === "error" ? "alert" : "status"}>
                  {operationalNameSaveMessage.text}
                </p>
              )}
            </form>

            <div className="assigned-user-editor">
              <label>
                <span>담당 사회복지사</span>
                <select
                  value={selectedRecipient.assignedBackofficeUserId ?? ""}
                  onChange={(event) => void handleAssignedBackofficeUserUpdate(event.target.value)}
                  disabled={isSaving}
                >
                  <option value="">미배정</option>
                  {backofficeUsers.map((user) => (
                    <option key={user.id} value={user.id}>{user.name} · {user.birthDate}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="detail-sections">
              {detailSections.map((section) => (
                <section key={section.title}>
                  <h3>{section.title}</h3>
                  <dl>
                    {section.fields.map((field) => (
                      <div key={field.label}>
                        <dt>{field.label}</dt>
                        <dd>{field.value(selectedRecipient) ?? "미등록"}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </article>
        </div>
      )}

      {selectedEmploymentContract && (
        <div className="detail-backdrop" role="presentation">
          <article
            className={`detail-panel ${
              selectedEmploymentContract.enabled ? "" : "is-disabled-detail"
            }`}
            aria-label={`${selectedEmploymentContract.workerName} 근로계약 상세 정보`}
          >
            <div className="detail-header">
              <button
                type="button"
                className="back-button"
                onClick={() => setSelectedEmploymentContractId(null)}
              >
                <ArrowLeft size={17} />
                목록으로
              </button>
              <div className="detail-actions">
                {selectedEmploymentContract.enabled && (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() => {
                      setEmploymentContractToDeactivate(selectedEmploymentContract);
                      setEmploymentDeactivateErrorMessage(null);
                    }}
                  >
                    <Trash2 size={17} />
                    계약 삭제
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setSelectedEmploymentContractId(null)}
                >
                  <X size={20} />
                  <span className="sr-only">닫기</span>
                </button>
              </div>
            </div>

            <div className="recipient-hero employment-hero">
              <span>계약 조건 {selectedEmploymentContract.contractTerms.length || 1}개</span>
              <h2>{selectedEmploymentContract.workerName}</h2>
              <p>
                {getEmploymentBirthDate(selectedEmploymentContract)} ·{" "}
                {formatEmploymentAge(selectedEmploymentContract) ?? "나이 미계산"} ·{" "}
                {selectedEmploymentContract.workerPhone ?? "전화번호 미등록"}
                {!selectedEmploymentContract.enabled && (
                  <strong className="inactive-inline">비활성화된 계약</strong>
                )}
              </p>
              <div>
                <small>대표 금액</small>
                <strong>
                  {formatCurrency(
                    selectedEmploymentContract.contractTerms[0]?.wageAmount ??
                      selectedEmploymentContract.wageAmount
                  )}
                </strong>
              </div>
            </div>

            <div className="detail-sections">
              {employmentContractDetailSections.map((section) => (
                <section key={section.title}>
                  <h3>{section.title}</h3>
                  <dl>
                    {section.fields.map((field) => (
                      <div key={field.label}>
                        <dt>{field.label}</dt>
                        <dd>{field.value(selectedEmploymentContract) ?? "미등록"}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </article>
        </div>
      )}

      {isCreatePanelOpen && (
        <div className="detail-backdrop" role="presentation">
          <article className="detail-panel" aria-label={editingRecipientId ? "수급자 정보 수정" : "수급자 등록"}>
            <div className="detail-header">
              <button type="button" className="back-button" onClick={closeCreatePanel}>
                <ArrowLeft size={17} />
                목록으로
              </button>
              <button type="button" className="icon-button" onClick={closeCreatePanel}>
                <X size={20} />
                <span className="sr-only">닫기</span>
              </button>
            </div>

            <form className="recipient-form" onSubmit={handleCreateRecipient}>
              <div className="form-heading">
                <span className="eyebrow">{editingRecipientId ? "Edit recipient" : "New recipient"}</span>
                <h2>{editingRecipientId ? "수급자 정보 수정" : "수급자 등록"}</h2>
              </div>

              {formErrorMessage && (
                <div className="form-error" role="alert">
                  <AlertTriangle size={18} />
                  {formErrorMessage}
                </div>
              )}

              <section className="form-section" aria-labelledby="basic-form-title">
                <h3 id="basic-form-title">기본 정보</h3>
                <div className="form-grid">
                  <label>
                    <span>수급자 이름</span>
                    <input
                      value={formState.name}
                      onChange={(event) => updateFormField("name", event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>업무식별명</span>
                    <input
                      value={formState.operationalName}
                      onChange={(event) => updateFormField("operationalName", event.target.value)}
                      placeholder="정성춘/3/함평군/파킨슨"
                      required
                    />
                  </label>
                  <label>
                    <span>생년월일</span>
                    <input
                      type="date"
                      {...dateInputLimits}
                      value={formState.birthDate}
                      onChange={(event) => updateFormField("birthDate", event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>장기요양인정번호</span>
                    <input
                      value={formState.longTermCareNumber}
                      onChange={(event) =>
                        updateFormField("longTermCareNumber", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>장기요양등급</span>
                    <select
                      value={formState.careGrade}
                      onChange={(event) => updateFormField("careGrade", event.target.value)}
                      required
                    >
                      <option>1등급</option>
                      <option>2등급</option>
                      <option>3등급</option>
                      <option>4등급</option>
                      <option>5등급</option>
                      <option>인지지원등급</option>
                    </select>
                  </label>
                  <label>
                    <span>수급자 연락처</span>
                    <input
                      value={formState.phone}
                      onChange={(event) =>
                        updateFormField("phone", formatPhoneNumberInput(event.target.value))
                      }
                    />
                  </label>
                  <label className="wide-field">
                    <span>수급자 주소</span>
                    <input
                      value={formState.address}
                      onChange={(event) => updateFormField("address", event.target.value)}
                      required
                    />
                  </label>
                </div>
              </section>

              <section className="form-section" aria-labelledby="representative-form-title">
                <h3 id="representative-form-title">대표 연락자</h3>
                <div className="form-grid">
                  <label>
                    <span>이름</span>
                    <input
                      value={formState.representativeName}
                      onChange={(event) =>
                        updateFormField("representativeName", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>관계</span>
                    <input
                      value={formState.representativeRelation}
                      onChange={(event) =>
                        updateFormField("representativeRelation", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>연락처</span>
                    <input
                      value={formState.representativePhone}
                      onChange={(event) =>
                        updateFormField(
                          "representativePhone",
                          formatPhoneNumberInput(event.target.value)
                        )
                      }
                      required
                    />
                  </label>
                </div>
              </section>

              <section className="form-section" aria-labelledby="contract-form-title">
                <h3 id="contract-form-title">장기요양이용계약</h3>
                <div className="form-grid">
                  <label>
                    <span>서비스 구분</span>
                    <select value={formState.serviceType} onChange={(event) => updateFormField("serviceType", event.target.value as RecipientFormState["serviceType"])}>
                      <option>방문</option>
                      <option>가족</option>
                    </select>
                  </label>
                  <label>
                    <span>감경여부</span>
                    <select value={formState.reductionType} onChange={(event) => updateFormField("reductionType", event.target.value as RecipientFormState["reductionType"])}>
                      <option>일반</option>
                      <option>감경</option>
                      <option>기초</option>
                    </select>
                  </label>
                  <label className="wide-field">
                    <span>요양보호사 구인조건</span>
                    <textarea value={formState.caregiverRequirements} onChange={(event) => updateFormField("caregiverRequirements", event.target.value)} placeholder="예: 여성 요양보호사, 자차 운전 가능" />
                  </label>
                  <label className="wide-field">
                    <span>수급자 관련 지인</span>
                    <textarea value={formState.relatedPeople} onChange={(event) => updateFormField("relatedPeople", event.target.value)} placeholder="예: 홍길동(이웃) 010-0000-0000" />
                  </label>
                  <label>
                    <span>장기요양이용계약 시작일</span>
                    <input
                      type="date"
                      {...dateInputLimits}
                      value={formState.serviceStartDate}
                      onChange={(event) => updateFormField("serviceStartDate", event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>장기요양이용계약 만료일</span>
                    <input
                      type="date"
                      {...dateInputLimits}
                      value={formState.serviceEndDate}
                      onChange={(event) => updateFormField("serviceEndDate", event.target.value)}
                      required
                    />
                  </label>
                </div>
              </section>

              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={closeCreatePanel}>
                  취소
                </button>
                <button type="submit" className="primary-button" disabled={isSaving}>
                  <Save size={18} />
                  {isSaving ? "저장 중" : editingRecipientId ? "수정 저장" : "저장"}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}

      {isEmploymentCreatePanelOpen && (
        <div className="detail-backdrop" role="presentation">
          <article className="detail-panel" aria-label="근로계약 등록">
            <div className="detail-header">
              <button type="button" className="back-button" onClick={closeEmploymentCreatePanel}>
                <ArrowLeft size={17} />
                목록으로
              </button>
              <button type="button" className="icon-button" onClick={closeEmploymentCreatePanel}>
                <X size={20} />
                <span className="sr-only">닫기</span>
              </button>
            </div>

            <form className="recipient-form" onSubmit={handleCreateEmploymentContract}>
              <div className="form-heading">
                <span className="eyebrow">New employment contract</span>
                <h2>근로계약 등록</h2>
              </div>

              {employmentFormErrorMessage && (
                <div className="form-error" role="alert">
                  <AlertTriangle size={18} />
                  {employmentFormErrorMessage}
                </div>
              )}

              <section className="form-section" aria-labelledby="worker-form-title">
                <h3 id="worker-form-title">근로자 정보</h3>
                <div className="form-grid">
                  <label>
                    <span>근로자 이름</span>
                    <input
                      value={employmentFormState.workerName}
                      onChange={(event) =>
                        updateEmploymentFormField("workerName", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>연락처</span>
                    <input
                      value={employmentFormState.workerPhone}
                      onChange={(event) =>
                        updateEmploymentFormField(
                          "workerPhone",
                          formatPhoneNumberInput(event.target.value)
                        )
                      }
                      required
                    />
                  </label>
                  <label className="wide-field">
                    <span>주민번호</span>
                    <input
                      value={employmentFormState.residentRegistrationNumber}
                      onChange={(event) =>
                        updateEmploymentFormField(
                          "residentRegistrationNumber",
                          formatResidentNumberInput(event.target.value)
                        )
                      }
                      required
                    />
                  </label>
                  <div className="computed-field-row">
                    <div>
                      <span>생년월일</span>
                      <strong>
                        {deriveBirthDateFromResidentNumber(
                          employmentFormState.residentRegistrationNumber
                        ) ?? "자동계산"}
                      </strong>
                    </div>
                    <div>
                      <span>나이</span>
                      <strong>
                        {(() => {
                          const birthDate = deriveBirthDateFromResidentNumber(
                            employmentFormState.residentRegistrationNumber
                          );
                          const age = birthDate ? calculateAgeFromBirthDate(birthDate) : null;
                          return age === null ? "자동계산" : `만 ${age}세`;
                        })()}
                      </strong>
                    </div>
                  </div>
                  <label>
                    <span>주거래 은행</span>
                    <input
                      value={employmentFormState.primaryBank}
                      onChange={(event) =>
                        updateEmploymentFormField("primaryBank", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>계좌번호</span>
                    <input
                      value={employmentFormState.bankAccountNumber}
                      onChange={(event) =>
                        updateEmploymentFormField(
                          "bankAccountNumber",
                          formatBankAccountNumberInput(event.target.value)
                        )
                      }
                      required
                    />
                  </label>
                </div>
              </section>

              <section className="form-section" aria-labelledby="terms-form-title">
                <div className="section-title-row">
                  <h3 id="terms-form-title">계약 정보</h3>
                  <button type="button" className="secondary-button" onClick={addEmploymentTerm}>
                    <Plus size={16} />
                    계약 추가
                  </button>
                </div>
                <div className="contract-term-list">
                  {employmentFormState.terms.map((term, index) => (
                    <div className="contract-term-row" key={term.id}>
                      <strong>{index + 1}</strong>
                      <label>
                        <span>월급/시급</span>
                        <select
                          value={term.wageType}
                          onChange={(event) =>
                            updateEmploymentTermField(
                              term.id,
                              "wageType",
                              event.target.value as "월급" | "시급"
                            )
                          }
                        >
                          <option>월급</option>
                          <option>시급</option>
                        </select>
                      </label>
                      <label>
                        <span>금액</span>
                        <input
                          type="number"
                          min="1"
                          value={term.wageAmount}
                          onChange={(event) =>
                            updateEmploymentTermField(term.id, "wageAmount", event.target.value)
                          }
                          required
                        />
                      </label>
                      <label>
                        <span>비과세식대</span>
                        <input
                          type="number"
                          min="0"
                          value={term.nonTaxableMealAllowance}
                          onChange={(event) =>
                            updateEmploymentTermField(
                              term.id,
                              "nonTaxableMealAllowance",
                              event.target.value
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>비과세차량</span>
                        <input
                          type="number"
                          min="0"
                          value={term.nonTaxableVehicleAllowance}
                          onChange={(event) =>
                            updateEmploymentTermField(
                              term.id,
                              "nonTaxableVehicleAllowance",
                              event.target.value
                            )
                          }
                        />
                      </label>
                      <label>
                        <span>기타비과세</span>
                        <input
                          type="number"
                          min="0"
                          value={term.otherNonTaxablePay}
                          onChange={(event) =>
                            updateEmploymentTermField(
                              term.id,
                              "otherNonTaxablePay",
                              event.target.value
                            )
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => removeEmploymentTerm(term.id)}
                        disabled={employmentFormState.terms.length === 1}
                      >
                        <Trash2 size={16} />
                        <span className="sr-only">계약 삭제</span>
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeEmploymentCreatePanel}
                >
                  취소
                </button>
                <button type="submit" className="primary-button" disabled={isEmploymentSaving}>
                  <Save size={18} />
                  {isEmploymentSaving ? "저장 중" : "저장"}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}

      {isBackofficeUserModalOpen && (
        <div className="alert-backdrop" role="presentation">
          <section className="alert-dialog backoffice-user-dialog" role="dialog" aria-modal="true" aria-labelledby="backoffice-user-title">
            <div className="dialog-heading">
              <div>
                <h2 id="backoffice-user-title">백오피스 사용자</h2>
                <p>이 기기에서 사용할 사용자를 선택하세요.</p>
              </div>
              <button type="button" className="icon-button" onClick={() => setIsBackofficeUserModalOpen(false)} aria-label="닫기">
                <X size={20} />
              </button>
            </div>

            <div className="backoffice-user-list">
              {backofficeUsers.length === 0 && <p className="empty-user-message">등록된 사용자가 없습니다.</p>}
              {backofficeUsers.map((user) => {
                const sessions = backofficeSessions.filter((session) => session.userId === user.id);
                return (
                  <button key={user.id} type="button" className={user.id === activeBackofficeUserId ? "is-active" : ""} onClick={() => void handleActivateBackofficeUser(user)} disabled={isBackofficeUserSaving}>
                    <span><strong>{user.name}</strong><small>{user.birthDate}</small></span>
                    <span className="user-presence">
                      {sessions.map((session) => (
                        <small key={session.deviceId}><i />{session.deviceId === deviceId ? "이 기기" : session.deviceName}</small>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>

            {!isBackofficeUserFormOpen ? (
              <button type="button" className="secondary-button" onClick={() => setIsBackofficeUserFormOpen(true)}>
                <UserPlus size={17} /> 신규 근로자 생성
              </button>
            ) : (
              <form className="backoffice-user-create-form" onSubmit={handleCreateBackofficeUser}>
                <label><span>이름</span><input value={newBackofficeUserName} onChange={(event) => setNewBackofficeUserName(event.target.value)} required /></label>
                <label><span>생년월일</span><input type="date" {...dateInputLimits} value={newBackofficeUserBirthDate} onChange={(event) => setNewBackofficeUserBirthDate(limitDateYear(event.target.value))} required /></label>
                <div className="alert-actions">
                  <button type="button" className="secondary-button" onClick={() => setIsBackofficeUserFormOpen(false)}>취소</button>
                  <button type="submit" className="primary-button" disabled={isBackofficeUserSaving}>{isBackofficeUserSaving ? "생성 중" : "확인"}</button>
                </div>
              </form>
            )}
            {backofficeUserError && <div className="form-error" role="alert"><AlertTriangle size={18} />{backofficeUserError}</div>}
          </section>
        </div>
      )}

      {recipientToDeactivate && (
        <div className="alert-backdrop" role="presentation">
          <section
            className="alert-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="deactivate-title"
            aria-describedby="deactivate-description"
          >
            <div className="alert-icon">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 id="deactivate-title">수급자 정보 삭제</h2>
              <p id="deactivate-description">
                {recipientToDeactivate.name} 수급자 정보를 삭제하시겠습니까?
              </p>
            </div>

            {deactivateErrorMessage && (
              <div className="form-error" role="alert">
                <AlertTriangle size={18} />
                {deactivateErrorMessage}
              </div>
            )}

            <div className="alert-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setRecipientToDeactivate(null)}
                disabled={isDeactivating}
              >
                NO
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void handleDeactivateRecipient()}
                disabled={isDeactivating}
              >
                <Trash2 size={17} />
                {isDeactivating ? "삭제 중" : "YES"}
              </button>
            </div>
          </section>
        </div>
      )}

      {employmentContractToDeactivate && (
        <div className="alert-backdrop" role="presentation">
          <section
            className="alert-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="employment-deactivate-title"
            aria-describedby="employment-deactivate-description"
          >
            <div className="alert-icon">
              <AlertTriangle size={24} />
            </div>
            <div>
              <h2 id="employment-deactivate-title">근로계약을 삭제 처리할까요?</h2>
              <p id="employment-deactivate-description">
                {employmentContractToDeactivate.workerName} 근로계약은 실제로 삭제되지 않고
                비활성화 상태로 표시됩니다.
              </p>
            </div>

            {employmentDeactivateErrorMessage && (
              <div className="form-error" role="alert">
                <AlertTriangle size={18} />
                {employmentDeactivateErrorMessage}
              </div>
            )}

            <div className="alert-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setEmploymentContractToDeactivate(null)}
                disabled={isEmploymentDeactivating}
              >
                취소
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void handleDeactivateEmploymentContract()}
                disabled={isEmploymentDeactivating}
              >
                <Trash2 size={17} />
                {isEmploymentDeactivating ? "처리 중" : "확인"}
              </button>
            </div>
          </section>
        </div>
      )}

      {recipientToTerminate && (
        <div className="alert-backdrop" role="presentation">
          <section
            className="alert-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="terminate-title"
            aria-describedby="terminate-description"
          >
            <div className="alert-icon warning-icon">
              <FileX2 size={24} />
            </div>
            <div>
              <h2 id="terminate-title">계약해지 처리</h2>
              <p id="terminate-description">
                {recipientToTerminate.name} 수급자의 장기요양이용계약 만료일을 기록하고 비활성화합니다.
              </p>
            </div>

            <label className="alert-field">
              <span>장기요양이용계약 만료일</span>
              <input
                type="date"
                {...dateInputLimits}
                value={terminationExpiredDate}
                min={recipientToTerminate.serviceStartDate}
                onChange={(event) => {
                  setTerminationExpiredDate(limitDateYear(event.target.value));
                  setTerminationErrorMessage(null);
                }}
              />
            </label>

            {terminationErrorMessage && (
              <div className="form-error" role="alert">
                <AlertTriangle size={18} />
                {terminationErrorMessage}
              </div>
            )}

            <div className="alert-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeTerminateDialog}
                disabled={isTerminating}
              >
                취소
              </button>
              <button
                type="button"
                className="warning-button"
                onClick={() => void handleTerminateContract()}
                disabled={isTerminating}
              >
                <FileX2 size={17} />
                {isTerminating ? "처리 중" : "확인"}
              </button>
            </div>
          </section>
        </div>
      )}

      {recipientToRestore && restoreFormState && (
        <div className="alert-backdrop" role="presentation">
          <section
            className="alert-dialog restore-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="restore-title"
            aria-describedby="restore-description"
          >
            <div className="alert-icon restore-icon">
              <RotateCcw size={24} />
            </div>
            <div>
              <h2 id="restore-title">계약복구</h2>
              <p id="restore-description">
                {recipientToRestore.name} 수급자의 복구 상황을 선택하고 급여 제공 내용을
                확인합니다.
              </p>
            </div>

            <div className="restore-options" role="radiogroup" aria-label="계약복구 유형">
              <label>
                <input
                  type="radio"
                  name="restoreType"
                  checked={restoreFormState.restoreType === "paused_return"}
                  onChange={() => updateRestoreField("restoreType", "paused_return")}
                />
                <span>
                  <strong>일시정지 후 복귀</strong>
                  <small>인정서류 변경 없이 기존 급여 제공 내용으로 복구합니다.</small>
                </span>
              </label>
              <label>
                <input
                  type="radio"
                  name="restoreType"
                  checked={restoreFormState.restoreType === "recontracted"}
                  onChange={() => updateRestoreField("restoreType", "recontracted")}
                />
                <span>
                  <strong>해지 후 재계약</strong>
                  <small>인정서류와 급여 제공 기간을 다시 확인합니다.</small>
                </span>
              </label>
            </div>

            {restoreFormState.restoreType === "recontracted" && (
              <div className="restore-date-grid">
                <label className="alert-field">
                  <span>장기요양이용계약 시작일</span>
                  <input
                    type="date"
                    {...dateInputLimits}
                    value={restoreFormState.serviceStartDate}
                    onChange={(event) =>
                      updateRestoreField("serviceStartDate", event.target.value)
                    }
                  />
                </label>
                <label className="alert-field">
                  <span>장기요양이용계약 만료일</span>
                  <input
                    type="date"
                    {...dateInputLimits}
                    value={restoreFormState.serviceEndDate}
                    onChange={(event) => updateRestoreField("serviceEndDate", event.target.value)}
                  />
                </label>
              </div>
            )}

            <label className="check-row">
              <input
                type="checkbox"
                checked={restoreFormState.documentsConfirmed}
                onChange={(event) =>
                  updateRestoreField("documentsConfirmed", event.target.checked)
                }
              />
              <span>
                <ClipboardCheck size={17} />
                장기요양급여 인정서류와 제공 내용을 확인했습니다.
              </span>
            </label>

            <label className="alert-field">
              <span>메모</span>
              <input
                value={restoreFormState.memo}
                onChange={(event) => updateRestoreField("memo", event.target.value)}
                placeholder="복구 사유나 확인 내용을 입력"
              />
            </label>

            {restoreErrorMessage && (
              <div className="form-error" role="alert">
                <AlertTriangle size={18} />
                {restoreErrorMessage}
              </div>
            )}

            <div className="alert-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={closeRestoreDialog}
                disabled={isRestoring}
              >
                취소
              </button>
              <button
                type="button"
                className="restore-button"
                onClick={() => void handleRestoreRecipient()}
                disabled={isRestoring}
              >
                <RotateCcw size={17} />
                {isRestoring ? "복구 중" : "복구"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
