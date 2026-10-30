import {summarizePlan} from './lib/recipient-plan-summary';
import './dev-sidebar.css';
import './dev-workspace.css';
import WorkHub from './WorkHub';
import RecipientServiceMonth from './RecipientServiceMonth';
import StaffRecords from './StaffRecords';
import SidebarGroup from './SidebarGroup';
import RecipientPlanPanel from "./RecipientPlanPanel";
import RecipientList, { type RecipientView } from "./RecipientList";
import RecipientServicePeriod from "./RecipientServicePeriod";
import { dateInputError } from "./lib/date-input";
import DateInput from "./DateInput";
import BasicEntryGrid from "./BasicEntryGrid";
import EmploymentConditionsDetails from "./EmploymentConditionsDetails";
import EmploymentConditionsEditor, { createEmptyWorkCondition, type EmploymentConditionFormTerm } from "./EmploymentConditionsEditor";
import type { AuthUser } from "./auth";
import EmploymentContractAttachments from "./EmploymentContractAttachments";
import { getMatchingSummary, getEmploymentContractStatus, getEmploymentCurrentYear, getWorkerKey, groupEmploymentContracts, compareEmploymentContracts, formatEmploymentPeriod, isValidEmploymentPeriod } from "./lib/employment-contracts";
import RecipientDocuments from "./RecipientDocuments";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
  type FormEvent
} from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  ChevronRight,
  Database,
  ClipboardCheck,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  FileX2,
  Trash2,
  UserRound,
  Users,
  X
} from "lucide-react";
import {
  createEmploymentContract,
  createRecipient,
  deleteRecipient,
  loadEmploymentContracts,
  loadBackofficeState,
  loadRecipients,
  restoreRecipient,
  terminateContract,
  updateEmploymentContract,
  updateRecipient,
} from "./storage";
import type {
  BackofficeUser,
  ContractRestoreType,
  EmploymentContract,
  EmploymentContractInput,
  EmploymentWorkCondition,
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
  contractStartDate: string;
  contractEndDate: string;
  workerName: string;
  residentRegistrationNumber: string;
  workerPhone: string;
  primaryBank: string;
  bankAccountNumber: string;
  monthlyTravelAllowance: string;
  terms: EmploymentContractTermFormState[];
};

type EmploymentContractTermFormState = EmploymentConditionFormTerm;

const createEmptyEmploymentTerm = (): EmploymentContractTermFormState => {
  const id = `employment-term-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, wageType: "시급", wageAmount: "", nonTaxableMealAllowance: "0",
    nonTaxableVehicleAllowance: "0", otherNonTaxablePay: "0", condition: createEmptyWorkCondition(id) };
};

const emptyEmploymentContractForm: EmploymentContractFormState = {
  contractStartDate: "",
  contractEndDate: "",
  workerName: "",
  residentRegistrationNumber: "",
  workerPhone: "",
  primaryBank: "",
  bankAccountNumber: "",
  monthlyTravelAllowance: "0",
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
  { key: "contractStartDate", label: "계약 시작일" },
  { key: "contractEndDate", label: "계약 종료일" },
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

const maskResidentNumber = (value: string) => {
  const formatted = formatResidentNumberInput(value);
  return formatted.length > 8 ? `${formatted.slice(0, 8)}${"*".repeat(formatted.length - 8)}` : formatted;
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
      { label: "병력 · 건강 메모", value: (recipient) => recipient.medicalHistory },
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
    title: "계약 정보",
    fields: [
      { label: "계약 기간", value: formatEmploymentPeriod },
      {
        label: "계약 조건",
        value: (contract) => formatContractTerms(contract)
      }
    ]
  },
  {
    title: "시스템 정보",
    fields: [
      { label: "유효 상태", value: (contract) => getEmploymentContractStatus(contract).label },
      { label: "메모", value: (contract) => contract.memo },
      { label: "내부 ID", value: (contract) => contract.id },
      { label: "생성일시", value: (contract) => contract.createdAt },
      { label: "수정일시", value: (contract) => contract.updatedAt }
    ]
  }
];

const formatDate = (value: string) => !value || !Number.isFinite(Date.parse(value)) ? "미등록" :
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));

const formatCurrency = (value: number) => `${value.toLocaleString("ko-KR")}원`;

const formatContractTerms = (contract: EmploymentContract) => {
  if (contract.isDraft && !contract.wageAmount && !contract.contractTerms.some((term) => term.wageAmount)) return "임금·근무 조건 미입력";
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

type RecipientStatus = "정보입력중" | "급여시작" | "급여제공중" | "급여갱신필요" | "계약종료예정" | "계약종료";

const getRecipientStatus = (recipient: Recipient, now = new Date()): RecipientStatus => {
  if (recipient.isDraft) return "정보입력중";
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

const limitDateYear = (value: string) => {
  const match = value.match(/^(\d{4})\d*(-.*)?$/);
  return match ? `${match[1]}${match[2] ?? ""}` : value;
};

const dateInputLimits = { min: "1000-01-01", max: "9999-12-31" } as const;

function App({ authUser, onSignOut }: { authUser: AuthUser; onSignOut: () => Promise<void> }) {
  const [recordsDirty, setRecordsDirty] = useState(false);
  const [serviceDirty,setServiceDirty]=useState(false),[serviceBusy,setServiceBusy]=useState(false);
  const [activeView, setActiveViewState] = useState<"recipients" | "employmentContracts" | "work" | "records" | "recipientServices">(
    "recipients"
  );
  function setActiveView(next: typeof activeView) {
    if(next!==activeView && activeView==='recipientServices') {
      if(serviceBusy)return;
      if(serviceDirty&&!window.confirm('적용하지 않은 체크 변경을 버리고 이동할까요?'))return;
    }
    setActiveViewState(next);
  }
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
  const [selectedAssignedUserId, setSelectedAssignedUserId] = useState("all");
  const [planEditingRequested, setPlanEditingRequested] = useState(false);
  const [recipientView, setRecipientView] = useState<RecipientView>("basic");
  const [isRecipientGridOpen, setIsRecipientGridOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ id: number; message: string } | null>(null);
  const [assigningRecipientIds, setAssigningRecipientIds] = useState<string[]>([]);
  const [assignmentErrors, setAssignmentErrors] = useState<Record<string, string>>({});
  const [backofficeUsers, setBackofficeUsers] = useState<BackofficeUser[]>([]);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
  const [editingRecipientId, setEditingRecipientId] = useState<string | null>(null);
  const [formState, setFormState] = useState<RecipientFormState>(emptyRecipientForm);
  const formErrorRef = useRef<HTMLDivElement>(null);
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
  const [isEmploymentGridOpen, setIsEmploymentGridOpen] = useState(false);
  const [employmentRegistrationFilter, setEmploymentRegistrationFilter] = useState("all");
  const [employmentSearchQuery, setEmploymentSearchQuery] = useState("");
  const [visibleResidentNumberIds, setVisibleResidentNumberIds] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedEmploymentWorkerIds, setExpandedEmploymentWorkerIds] = useState<Set<string>>(() => new Set());
  const [showEnabledEmploymentOnly, setShowEnabledEmploymentOnly] = useState(true);
  const [employmentCurrentYear, setEmploymentCurrentYear] = useState(getEmploymentCurrentYear);
  useEffect(() => {
    const timer = window.setInterval(() => setEmploymentCurrentYear(getEmploymentCurrentYear()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const [isEmploymentLoading, setIsEmploymentLoading] = useState(true);
  const [employmentErrorMessage, setEmploymentErrorMessage] = useState<string | null>(null);
  const [isEmploymentCreatePanelOpen, setIsEmploymentCreatePanelOpen] = useState(false);
  const [includeWorkConditions, setIncludeWorkConditions] = useState(true);
  const [isEditingEmploymentContract, setIsEditingEmploymentContract] = useState(false);
  const [employmentRenewalSource, setEmploymentRenewalSource] = useState<EmploymentContract | null>(null);
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

    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "담당자 정보를 불러오지 못했습니다.");
    }
  }, []);

  useEffect(() => {
    void fetchRecipients();
    void fetchEmploymentContracts();
    void fetchBackofficeState();
  }, [fetchBackofficeState, fetchEmploymentContracts, fetchRecipients]);

  useEffect(() => {
    if (!notification) return;

    const timeoutId = window.setTimeout(() => setNotification(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [notification]);

  useEffect(() => {
    if (formErrorMessage) { formErrorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); formErrorRef.current?.focus(); }
  }, [formErrorMessage]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]') || isRecipientGridOpen || isEmploymentGridOpen) return;
      if (recipientToRestore) { setRecipientToRestore(null); return; }
      if (recipientToTerminate) { setRecipientToTerminate(null); return; }
      if (employmentContractToDeactivate) { setEmploymentContractToDeactivate(null); return; }
      if (recipientToDeactivate) { setRecipientToDeactivate(null); return; }
      if (isCreatePanelOpen) { closeCreatePanel(); return; }
      if (isEmploymentCreatePanelOpen) { closeEmploymentCreatePanel(); return; }
      if (selectedEmploymentContractId) { setSelectedEmploymentContractId(null); return; }
      setSelectedRecipientId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [recipientToRestore,recipientToTerminate,employmentContractToDeactivate,recipientToDeactivate,isCreatePanelOpen,isEmploymentCreatePanelOpen,selectedEmploymentContractId,isRecipientGridOpen,isEmploymentGridOpen]);

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

        if (selectedAssignedUserId !== "all" && recipient.assignedBackofficeUserId !== selectedAssignedUserId) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [
          recipient.name,
          recipient.operationalName,
          recipient.longTermCareNumber,
          recipient.careGrade,
          recipient.medicalHistory,
          recipient.familyNotes,
          recipient.hospitalNotes,
          recipient.servicePlanNotes,
          recipient.caregiverRequirements,
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
  }, [recipients, searchQuery, selectedStatus, selectedAssignedUserId, showEnabledOnly]);

  const selectedRecipient =
    recipients.find((recipient) => recipient.id === selectedRecipientId) ?? null;


  useEffect(() => {
    setOperationalNameDraft(selectedRecipient?.operationalName ?? "");
    setOperationalNameSaveMessage(null);
  }, [selectedRecipient?.id, selectedRecipient?.operationalName]);
  const enabledRecipientCount = recipients.filter((recipient) => isRecipientEnabled(recipient) && !recipient.isDraft).length;
  const renewalCount = recipients.filter((recipient) =>
    ["급여갱신필요", "계약종료예정"].includes(getRecipientStatus(recipient))
  ).length;
  const filteredEmploymentContracts = useMemo(() => {
    const query = employmentSearchQuery.trim().toLocaleLowerCase();

    return [...employmentContracts]
      .filter((contract) => {
        if (employmentRegistrationFilter === "draft" && !contract.isDraft) return false;
        if (employmentRegistrationFilter === "complete" && contract.isDraft) return false;
        if (showEnabledEmploymentOnly && !getEmploymentContractStatus(contract, employmentCurrentYear).valid) {
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
      .sort(compareEmploymentContracts);
  }, [employmentContracts, employmentSearchQuery, showEnabledEmploymentOnly, employmentCurrentYear, employmentRegistrationFilter]);
  const employmentWorkerGroups = useMemo(() => {
    const matchingIds = new Set(filteredEmploymentContracts.map((contract) => contract.id));
    return groupEmploymentContracts(employmentContracts.filter((contract) =>
      (employmentRegistrationFilter !== "draft" || contract.isDraft) &&
      (employmentRegistrationFilter !== "complete" || !contract.isDraft) &&
      (!showEnabledEmploymentOnly || getEmploymentContractStatus(contract, employmentCurrentYear).valid)
    )).filter((contracts) => contracts.some((contract) => matchingIds.has(contract.id)));
  }, [employmentContracts, filteredEmploymentContracts, showEnabledEmploymentOnly, employmentCurrentYear, employmentRegistrationFilter]);
  const selectedEmploymentContract =
    employmentContracts.find((contract) => contract.id === selectedEmploymentContractId) ?? null;
  const selectedWorkerHistory = selectedEmploymentContract
    ? employmentContracts.filter((contract) => getWorkerKey(contract) === getWorkerKey(selectedEmploymentContract)).sort(compareEmploymentContracts)
    : [];
  const enabledEmploymentContractCount = employmentContracts.filter(
    (contract) => getEmploymentContractStatus(contract, employmentCurrentYear).valid
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
    field: keyof Omit<EmploymentContractTermFormState, "id" | "condition">,
    value: string
  ) => {
    setEmploymentFormState((current) => {
      const terms = current.terms.map((term) =>
        term.id === termId ? { ...term, [field]: value, condition: { ...term.condition, documentStatus: "needs_confirmation" as const } } : term
      );

      return { ...current, terms };
    });
    setEmploymentFormErrorMessage(null);
  };

  const updateEmploymentCondition = (id: string, patch: Partial<EmploymentWorkCondition>) => {
    setEmploymentFormState((current) => ({ ...current, terms: current.terms.map((term) =>
      term.id === id ? { ...term, condition: { ...term.condition, ...patch, documentStatus: patch.documentStatus ?? "needs_confirmation" } } : term) }));
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

  const openEmploymentRenewalPanel = (contract: EmploymentContract, editing = false) => {
    setIsEditingEmploymentContract(editing);
    setIncludeWorkConditions(!editing || Boolean(contract.isDraft) || Boolean(contract.workConditions));
    const terms = contract.contractTerms.length ? contract.contractTerms : [{
      wageType: contract.wageType === "시급" ? "시급" as const : "월급" as const,
      wageAmount: contract.wageAmount,
      nonTaxableMealAllowance: contract.nonTaxableMealAllowance,
      nonTaxableVehicleAllowance: contract.nonTaxableVehicleAllowance,
      otherNonTaxablePay: contract.taxableExtraPay
    }];
    setEmploymentFormState({
      workerName: contract.workerName,
      residentRegistrationNumber: contract.residentRegistrationNumber,
      workerPhone: contract.workerPhone ?? "",
      primaryBank: contract.primaryBank,
      bankAccountNumber: contract.bankAccountNumber,
      contractStartDate: editing ? contract.contractStartDate : "",
      contractEndDate: editing ? contract.contractEndDate ?? "" : "",
      monthlyTravelAllowance: String(contract.workConditions?.monthlyTravelAllowance ?? 0),
      terms: terms.map((term) => {
        const id = editing && term.id ? term.id : createEmptyEmploymentTerm().id;
        const previous = contract.workConditions?.conditions.find((condition) => condition.termId === term.id);
        return ({
        id,
        condition: { ...(previous ?? createEmptyWorkCondition(id)), termId: id,
          ...(!editing ? { effectiveStartDate: "", effectiveEndDate: "", statusDate: "", matchingStatus: "pending" as const, documentStatus: "needs_confirmation" as const, changeReason: "" } : {}) },
        wageType: term.wageType,
        wageAmount: contract.isDraft && !term.wageAmount ? "" : String(term.wageAmount),
        nonTaxableMealAllowance: String(term.nonTaxableMealAllowance),
        nonTaxableVehicleAllowance: String(term.nonTaxableVehicleAllowance),
        otherNonTaxablePay: String(term.otherNonTaxablePay)
      }); })
    });
    setEmploymentRenewalSource(contract);
    setEmploymentFormErrorMessage(null);
    setSelectedEmploymentContractId(null);
    setIsEmploymentCreatePanelOpen(true);
  };

  const closeEmploymentCreatePanel = () => {
    setIncludeWorkConditions(true);
    setIsEditingEmploymentContract(false);
    setEmploymentRenewalSource(null);
    setIsEmploymentCreatePanelOpen(false);
    setEmploymentFormState(emptyEmploymentContractForm);
    setEmploymentFormErrorMessage(null);
  };

  const handleCreateRecipient = async (event?: FormEvent<HTMLFormElement>, saveAsDraft = false) => {
    event?.preventDefault();

    const missingField = (saveAsDraft ? requiredFormFields.filter(({ key }) => key === "name") : requiredFormFields).find(({ key }) => !formState[key].trim());

    if (missingField) {
      setFormErrorMessage(`${missingField.label}을(를) 입력하세요.`);
      return;
    }

    if (formState.serviceStartDate && formState.serviceEndDate && formState.serviceStartDate > formState.serviceEndDate) {
      setFormErrorMessage("장기요양이용계약 시작일은 만료일보다 늦을 수 없습니다.");
      return;
    }

    for (const key of ['birthDate','serviceStartDate','serviceEndDate'] as const) {
      const message = dateInputError(formState[key], !saveAsDraft);
      if (message) { setFormErrorMessage(`${requiredFormFields.find(f=>f.key===key)?.label}: ${message}`); return; }
    }
    const recipientBeingEdited = recipients.find((recipient) => recipient.id === editingRecipientId);
    const recipientToSave: RecipientInput = {
      isDraft: saveAsDraft,
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
      if (recipientBeingEdited?.isDraft && !savedRecipient.isDraft) setSelectedStatus("전체");
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

  const handleAssignedBackofficeUserUpdate = async (recipient: Recipient, userId: string) => {
    if (assigningRecipientIds.includes(recipient.id) || (recipient.assignedBackofficeUserId ?? "") === userId) return;
    setAssigningRecipientIds((current) => [...current, recipient.id]);
    setAssignmentErrors((current) => ({ ...current, [recipient.id]: "" }));
    try {
      const updated = await updateRecipient({ ...recipient, assignedBackofficeUserId: userId || undefined });
      setRecipients((current) => current.map((item) => item.id === updated.id ? updated : item));
      const user = backofficeUsers.find((item) => item.id === userId);
      showNotification(userId
        ? `${recipient.name}님의 담당 사회복지사를 ${user?.name ?? "선택한 사용자"}(으)로 배정했습니다.`
        : `${recipient.name}님의 담당 사회복지사 배정을 해제했습니다.`);
    } catch (error) {
      setAssignmentErrors((current) => ({
        ...current,
        [recipient.id]: error instanceof Error ? error.message : "담당 사회복지사를 저장하지 못했습니다."
      }));
    } finally {
      setAssigningRecipientIds((current) => current.filter((id) => id !== recipient.id));
    }
  };

  const handleCreateEmploymentContract = async (event?: FormEvent<HTMLFormElement>, saveAsDraft = false) => {
    event?.preventDefault();

    const missingField = (saveAsDraft ? requiredEmploymentContractFields.filter(({ key }) => key === "workerName") : requiredEmploymentContractFields).find(({ key }) => {
      const value = employmentFormState[key];
      return typeof value !== "string" || !value.trim();
    });

    if (missingField) {
      setEmploymentFormErrorMessage(`${missingField.label}을(를) 입력하세요.`);
      return;
    }

    if ((!saveAsDraft || (employmentFormState.contractStartDate && employmentFormState.contractEndDate)) && !isValidEmploymentPeriod(employmentFormState.contractStartDate, employmentFormState.contractEndDate)) {
      setEmploymentFormErrorMessage("계약 기간을 확인하세요. 종료일은 시작일보다 빠를 수 없습니다.");
      return;
    }

    const derivedWorkerBirthDate = deriveBirthDateFromResidentNumber(
      employmentFormState.residentRegistrationNumber
    );

    if (!derivedWorkerBirthDate && (!saveAsDraft || employmentFormState.residentRegistrationNumber.trim())) {
      setEmploymentFormErrorMessage("주민번호 앞 7자리를 확인하세요.");
      return;
    }

    const contractTerms = employmentFormState.terms.map((term) => ({
      id: term.id,
      wageType: term.wageType,
      wageAmount: Number(term.wageAmount),
      nonTaxableMealAllowance: Number(term.nonTaxableMealAllowance || 0),
      nonTaxableVehicleAllowance: Number(term.nonTaxableVehicleAllowance || 0),
      otherNonTaxablePay: Number(term.otherNonTaxablePay || 0)
    }));

    const invalidTermIndex = contractTerms.findIndex(
      (term) =>
        !Number.isFinite(term.wageAmount) ||
        (saveAsDraft ? term.wageAmount < 0 : term.wageAmount <= 0) ||
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
      isDraft: saveAsDraft,
      ...(isEditingEmploymentContract && employmentRenewalSource ? { updatedAt: employmentRenewalSource.updatedAt } : {}),
      id: isEditingEmploymentContract && employmentRenewalSource ? employmentRenewalSource.id : createEmploymentContractId(),
      workerName: employmentFormState.workerName.trim(),
      workerBirthDate: derivedWorkerBirthDate ?? "",
      residentRegistrationNumber: formatResidentNumberInput(
        employmentFormState.residentRegistrationNumber.trim()
      ),
      ...(employmentFormState.workerPhone.trim()
        ? { workerPhone: formatPhoneNumberInput(employmentFormState.workerPhone.trim()) }
        : {}),
      primaryBank: employmentFormState.primaryBank.trim(),
      bankAccountNumber: formatBankAccountNumberInput(employmentFormState.bankAccountNumber.trim()),
      workerAddress: employmentRenewalSource?.workerAddress ?? "미입력",
      jobTitle: employmentRenewalSource?.jobTitle ?? "근로자",
      employmentType: employmentRenewalSource?.employmentType ?? "근로계약 묶음",
      workplaceType: employmentRenewalSource?.workplaceType ?? "office",
      workplace: employmentRenewalSource?.workplace ?? "미입력",
      recipientAssignments: employmentRenewalSource?.recipientAssignments ?? [],
      contractStartDate: employmentFormState.contractStartDate,
      contractEndDate: employmentFormState.contractEndDate,
      workDays: includeWorkConditions ? employmentFormState.terms[0].condition.workDays : employmentRenewalSource?.workDays || "미입력",
      workStartTime: includeWorkConditions ? employmentFormState.terms[0].condition.workStartTime : employmentRenewalSource?.workStartTime || "09:00",
      workEndTime: includeWorkConditions ? employmentFormState.terms[0].condition.workEndTime : employmentRenewalSource?.workEndTime || "18:00",
      breakMinutes: includeWorkConditions ? employmentFormState.terms[0].condition.breakMinutes : employmentRenewalSource?.breakMinutes ?? 0,
      wageType: firstTerm.wageType,
      wageAmount: firstTerm.wageAmount,
      nonTaxableVehicleAllowance: firstTerm.nonTaxableVehicleAllowance,
      nonTaxableMealAllowance: firstTerm.nonTaxableMealAllowance,
      taxableExtraPay: firstTerm.otherNonTaxablePay,
      paymentDate: employmentRenewalSource?.paymentDate ?? "미입력",
      insuranceStatus: employmentRenewalSource?.insuranceStatus ?? "별도 관리",
      insuranceSnapshots: isEditingEmploymentContract ? employmentRenewalSource?.insuranceSnapshots ?? []
        : (employmentRenewalSource?.insuranceSnapshots ?? []).map((snapshot) => ({ ...snapshot, id: undefined })),
      allowanceMemo: employmentRenewalSource?.allowanceMemo,
      memo: employmentRenewalSource?.memo,
      contractTerms,
      ...(includeWorkConditions ? { workConditions: {
        monthlyTravelAllowance: Number(employmentFormState.monthlyTravelAllowance || 0),
        conditions: employmentFormState.terms.map((term) => ({ ...term.condition, termId: term.id,
          effectiveStartDate: term.condition.effectiveStartDate || employmentFormState.contractStartDate,
          effectiveEndDate: term.condition.effectiveEndDate || employmentFormState.contractEndDate
        })),
        history: []
      } } : {}),
      enabled: isEditingEmploymentContract ? employmentRenewalSource?.enabled ?? true : true
    };

    setIsEmploymentSaving(true);

    try {
      const createdContract = isEditingEmploymentContract
        ? await updateEmploymentContract(newContract)
        : await createEmploymentContract(newContract);
      setEmploymentContracts((current) => isEditingEmploymentContract
        ? current.map((contract) => contract.id === createdContract.id ? createdContract : contract)
        : [...current, createdContract]);
      if (saveAsDraft) { setShowEnabledEmploymentOnly(false); setEmploymentRegistrationFilter("draft"); }
      else if (employmentRenewalSource?.isDraft || !isEditingEmploymentContract) { setEmploymentRegistrationFilter("all"); setShowEnabledEmploymentOnly(false); }
      setSelectedEmploymentContractId(createdContract.id);
      closeEmploymentCreatePanel();
      setEmploymentErrorMessage(null);
    } catch (error) {
      if (error instanceof Error && error.message.includes("다른 사용자가")) void fetchEmploymentContracts();
      setEmploymentFormErrorMessage(
        error instanceof Error ? error.message : "근로계약 정보를 저장하지 못했습니다."
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

  const renderEmploymentContractRow = (contract: EmploymentContract, isLatest: boolean) => {
    const status = getEmploymentContractStatus(contract, employmentCurrentYear);
    const matching = getMatchingSummary(contract);
    return (
      <div
        className={`recipient-row employment-contract-row ${isLatest ? "" : "is-history"}`}
        onClick={() => setSelectedEmploymentContractId(contract.id)}
      >
        <button type="button" className="recipient-name employment-worker-button"
          aria-label={`${contract.workerName} 근로계약 상세 보기`}>
          <strong>{contract.workerName}</strong>
          <small className="contract-order-label">{isLatest ? "최신 계약" : "이전 계약"}</small>

        </button>
        <span className="resident-number-cell">
          <span>{(visibleResidentNumberIds.has(contract.id)
            ? contract.residentRegistrationNumber
            : maskResidentNumber(contract.residentRegistrationNumber)) || "미등록"}</span>
          <button
            type="button"
            className="resident-number-toggle"
            disabled={!contract.residentRegistrationNumber}
            aria-label={`${contract.workerName} 주민번호 ${visibleResidentNumberIds.has(contract.id) ? "숨기기" : "표기"}`}
            aria-pressed={visibleResidentNumberIds.has(contract.id)}
            onClick={(event) => {
              event.stopPropagation();
              setVisibleResidentNumberIds((previous) => {
                const next = new Set(previous);
                if (next.has(contract.id)) next.delete(contract.id);
                else next.add(contract.id);
                return next;
              });
            }}
          >
            {visibleResidentNumberIds.has(contract.id) ? "숨기기" : "표기"}
          </button>
        </span>
        <span>{contract.workerPhone ?? "미등록"}</span>
        <span className="employment-period-cell">
          <strong className="employment-period">{formatEmploymentPeriod(contract)}</strong>
          <span className={`employment-validity ${status.valid ? "is-valid" : "is-invalid"}`}>
            <em>{status.valid ? "유효함" : status.label.startsWith("계약종료/") ? "계약종료" : status.label}</em>
            <small>{status.valid ? `${employmentCurrentYear}년 계약` : status.label.startsWith("계약종료/")
              ? `${status.label.split("/")[1]} · 올해 계약 기간 아님`
              : status.label === "정보 입력 중" ? "상세 정보를 입력해 주세요" : status.label === "비활성화" ? "삭제 처리된 계약" : status.label === "계약기간 확인 필요" ? "시작일·종료일 확인 필요" : "근무 연결 상태 확인 필요"}</small>
          </span>
          {!contract.isDraft && <small className="matching-summary">{matching.label}</small>}
        </span>
        <span className="expiry">
          <strong>{contract.isDraft && !(contract.contractTerms[0]?.wageAmount ?? contract.wageAmount) ? "약정 미입력" : formatCurrency(contract.contractTerms[0]?.wageAmount ?? contract.wageAmount)}</strong>
          <small>{contract.isDraft ? "상세 입력 필요" : `${contract.contractTerms[0]?.wageType ?? contract.wageType} · 계약 조건 ${contract.contractTerms.length || 1}개`}</small>
        </span>
        <ChevronRight size={18} />
      </div>
    );
  };

  return (
    <div className="app-shell sidebar-preview">
      {notification && (
        <div key={notification.id} className="top-notification" role="status" aria-live="polite">
          <ClipboardCheck size={19} aria-hidden="true" />
          <span>{notification.message}</span>
        </div>
      )}
      <header className="app-header">
        <div className="brand">
            <div className="sidebar-identity">
              <strong>miso</strong>
              <span>센터 운영 백오피스</span>
            </div>
        </div>
        <div className="header-actions">
          <div className="google-account">
            <UserRound size={17} aria-hidden="true" />
            <span><strong>{authUser.name}</strong><small>{authUser.email}</small></span>
            <button type="button" className="secondary-button" onClick={() => void onSignOut()}>로그아웃</button>
          </div>
          <span className="sidebar-section-label">센터 운영</span>
          <nav className="view-tabs sidebar-group-navigation" aria-label="관리 메뉴">
            <SidebarGroup title="수급자" active={activeView === "recipients" || activeView === "recipientServices"}>
            <button
              type="button"
              className={activeView === "recipients" ? "is-active" : ""}
              aria-current={activeView === "recipients" ? "page" : undefined}
              onClick={() => {
                if (activeView === "records" && recordsDirty && !window.confirm("저장하지 않은 근무기록을 닫고 이동할까요?")) return; setActiveView("recipients");
                setSelectedEmploymentContractId(null);
                setIsEmploymentCreatePanelOpen(false);
              }}
            >
              <Users size={16} />
              수급자 기초정보
            </button>
            <button type="button" className={activeView==='recipientServices'?'is-active':''} aria-current={activeView==='recipientServices'?'page':undefined} onClick={()=>{if(activeView==='records'&&recordsDirty&&!window.confirm('저장하지 않은 근무기록을 닫고 이동할까요?'))return;setActiveView('recipientServices');setSelectedRecipientId(null);setSelectedEmploymentContractId(null);setIsCreatePanelOpen(false);setIsEmploymentCreatePanelOpen(false);}}><ClipboardCheck size={16}/>방문요양 서비스 관리</button>
</SidebarGroup>
            <SidebarGroup title="요양보호사, 사회복지사" active={activeView === "employmentContracts"}>
            <button
              type="button"
              className={activeView === "employmentContracts" ? "is-active" : ""}
              aria-current={activeView === "employmentContracts" ? "page" : undefined}
              onClick={() => {
                if (activeView === "records" && recordsDirty && !window.confirm("저장하지 않은 근무기록을 닫고 이동할까요?")) return; setActiveView("employmentContracts");
                setSelectedRecipientId(null);
                setIsCreatePanelOpen(false);
              }}
            >
              <Briefcase size={16} />
              근로계약서
            </button>
            </SidebarGroup>
            <SidebarGroup title="센터 실무" active={activeView === "work" || activeView === "records"}>
            <button type="button" className={activeView === "work" ? "is-active" : ""}
              aria-current={activeView === "work" ? "page" : undefined}
              onClick={() => {
                if (activeView === "records" && recordsDirty && !window.confirm("저장하지 않은 근무기록을 닫고 이동할까요?")) return; setActiveView("work");
                setSelectedRecipientId(null);
                setSelectedEmploymentContractId(null);
                setIsCreatePanelOpen(false);
                setIsEmploymentCreatePanelOpen(false);
                setIsQuickAddOpen(false);
              }}>
              <ClipboardCheck size={16} />센터업무(할일)
            </button>
            <button type="button" className={activeView === "records" ? "is-active" : ""} aria-current={activeView === "records" ? "page" : undefined} onClick={() => { setActiveView("records"); setSelectedRecipientId(null); setSelectedEmploymentContractId(null); setIsCreatePanelOpen(false); setIsEmploymentCreatePanelOpen(false); }}><ClipboardCheck size={16}/>근무기록</button>
            </SidebarGroup>
            <SidebarGroup title="기관 운영 서류 업무"><button type="button" disabled className="sidebar-coming-soon">추가중</button></SidebarGroup>
          </nav>
          <div className="runtime-badge">
            <Database size={16} />
            Supabase Postgres
          </div>
        </div>
      </header>
      {import.meta.env.DEV && <div className="development-indicator" role="note" aria-label="개발 환경">DEV · 개발 환경</div>}

      <main className="main-content">
        {activeView === "recipientServices" ? <RecipientServiceMonth onDirty={setServiceDirty} onBusy={setServiceBusy}/> : activeView === "records" ? <StaffRecords onDirty={setRecordsDirty}/> : activeView === "work" ? <WorkHub onDirectoryChanged={() => { void fetchRecipients(); void fetchEmploymentContracts(); }} /> : activeView === "recipients" ? (
          <>
        <section className="page-heading">
          <div>
            <span className="eyebrow">Recipients</span>
            <h1>수급자 관리</h1>
            <p>기본 정보와 장기요양이용계약 기간을 기록하고 확인합니다.</p>
          </div>
          <div className="heading-actions">
            <button type="button" className="primary-button" onClick={() => setIsRecipientGridOpen(true)}>
              <Plus size={18} /> 표로 여러 명 입력
            </button>

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
              <label><span>생년월일</span><DateInput {...dateInputLimits} value={formState.birthDate} onChange={(event) => updateFormField("birthDate", event.target.value)} required /></label>
              <label><span>인정번호</span><input value={formState.longTermCareNumber} onChange={(event) => updateFormField("longTermCareNumber", event.target.value)} required /></label>
              <label><span>등급</span><select value={formState.careGrade} onChange={(event) => updateFormField("careGrade", event.target.value)}>{["1등급","2등급","3등급","4등급","5등급","인지지원등급"].map((grade) => <option key={grade}>{grade}</option>)}</select></label>
              <label className="quick-address-field"><span>수급자 주소</span><input value={formState.address} onChange={(event) => updateFormField("address", event.target.value)} placeholder="예: 광주광역시 광산구 신창동" required /></label>
              <label><span>장기요양이용계약 시작일</span><DateInput {...dateInputLimits} value={formState.serviceStartDate} onChange={(event) => updateFormField("serviceStartDate", event.target.value)} required /></label>
              <label><span>장기요양이용계약 만료일</span><DateInput {...dateInputLimits} value={formState.serviceEndDate} onChange={(event) => updateFormField("serviceEndDate", event.target.value)} required /></label>
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
              <span>{recipientView==='plan'?'메모는 앞부분만 표시합니다. 행을 누르면 전체 계획과 변경 이력을 확인합니다.':'장기요양이용계약 만료일 오름차순'}</span>
            </div>
            <div className="toolbar-controls">
              <select className="filter-select" aria-label="담당 사회복지사 필터" value={selectedAssignedUserId} onChange={(event) => setSelectedAssignedUserId(event.target.value)}>
                <option value="all">담당자 전체</option>
                {backofficeUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <select className="filter-select" aria-label="계약 상태 필터" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value as RecipientStatus | "전체")}>
                {(["전체", "정보입력중", "급여시작", "급여제공중", "급여갱신필요", "계약종료예정", "계약종료"] as const).map((status) => <option key={status} value={status}>{status === "전체" ? "상태 전체" : status === "정보입력중" ? "정보 입력 중" : status}</option>)}
              </select>
              <div className="density-toggle" role="group" aria-label="수급자 보기 방식">
                {([['basic','기본'],['plan','계획'],['validity','유효'],['address','주소']] as const).map(([value,label])=><button type="button" key={value} aria-pressed={recipientView===value} className={recipientView===value?'is-active':''} onClick={()=>setRecipientView(value)}>{label}</button>)}
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
                  placeholder="이름, 인정번호, 계획 메모, 주소, 연락처 검색"
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
            <RecipientList recipients={filteredRecipients} view={recipientView} users={backofficeUsers} status={getRecipientStatus}
              open={r=>{setPlanEditingRequested(false);setSelectedRecipientId(r.id);}} edit={r=>{if(recipientView==='plan'){setPlanEditingRequested(true);setSelectedRecipientId(r.id);}else openRecipientEditPanel(r);}}
              remove={r=>{setRecipientToDeactivate(r);setDeactivateErrorMessage(null);}}
              assign={(r,id)=>void handleAssignedBackofficeUserUpdate(r,id)} assigning={assigningRecipientIds} errors={assignmentErrors} />
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
                <button type="button" className="primary-button" onClick={() => setIsEmploymentGridOpen(true)}>
                  <Plus size={18} /> 표로 여러 명 입력
                </button>


                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    setSelectedEmploymentContractId(null);
                    setIsEditingEmploymentContract(false);
                    setEmploymentRenewalSource(null);
                    setEmploymentFormState({ ...emptyEmploymentContractForm, terms: [createEmptyEmploymentTerm()] });
                    setEmploymentFormErrorMessage(null);
                    setIncludeWorkConditions(true);
                    setIsEmploymentCreatePanelOpen(true);
                  }}
                >
                  <Plus size={18} />
                  근로계약 등록
                </button>
                <div className="summary-card">
                  <span>{employmentCurrentYear}년 유효 계약</span>
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
                  <select className="filter-select" aria-label="근로계약 등록 상태" value={employmentRegistrationFilter}
                    onChange={(event) => { setEmploymentRegistrationFilter(event.target.value); if (event.target.value === "draft") setShowEnabledEmploymentOnly(false); }}>
                    <option value="all">등록 상태 전체</option><option value="draft">정보 입력 중</option><option value="complete">등록 완료</option>
                  </select>
                  <label className="valid-toggle">
                    <input
                      type="checkbox"
                      checked={showEnabledEmploymentOnly}
                      onChange={(event) => setShowEnabledEmploymentOnly(event.target.checked)}
                    />
                    <span>올해 유효 계약만</span>
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
                    <span>계약 기간 · 유효 상태</span>
                    <span>대표 금액</span>
                    <span aria-hidden="true" />
                  </div>
                  <ul>
                    {employmentWorkerGroups.map((contracts) => {
                      const contract = contracts[0];
                      const workerKey = getWorkerKey(contract);
                      const expanded = expandedEmploymentWorkerIds.has(workerKey);
                      return (
                      <li key={workerKey} className={`employment-worker-group ${expanded ? "is-expanded" : ""}`}>
                        {renderEmploymentContractRow(contract, true)}
                        {contracts.length > 1 && (
                          <div className="employment-list-history">
                            <button type="button" className="secondary-button"
                              aria-expanded={expanded} aria-controls={`employment-history-${contract.id}`}
                              onClick={() => setExpandedEmploymentWorkerIds((previous) => {
                                const next = new Set(previous);
                                if (next.has(workerKey)) next.delete(workerKey); else next.add(workerKey);
                                return next;
                              })}>
                              계약 {contracts.length}건 · {expanded ? "이전 계약 접기" : "이전 계약 펼치기"}
                            </button>
                            <div id={`employment-history-${contract.id}`} hidden={!expanded}>
                              {contracts.slice(1).map((history) => (
                                <div key={history.id}>{renderEmploymentContractRow(history, false)}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </li>
                    ); })}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {isEmploymentGridOpen && <BasicEntryGrid mode="employment" existingContracts={employmentContracts}
        onClose={() => setIsEmploymentGridOpen(false)} onContractsSaved={(saved) => {
          setEmploymentContracts((current) => [...current.filter((contract) => !saved.some((item) => item.id === contract.id)), ...saved]);
          setIsEmploymentGridOpen(false); if (activeView === "records" && recordsDirty && !window.confirm("저장하지 않은 근무기록을 닫고 이동할까요?")) return; setActiveView("employmentContracts"); setEmploymentSearchQuery("");
          setShowEnabledEmploymentOnly(false); setEmploymentRegistrationFilter("draft");
          showNotification(`${saved.length}건의 기본 정보를 저장했습니다. 이름을 눌러 상세 정보를 보완해 주세요.`);
        }} />}

      {isRecipientGridOpen && <BasicEntryGrid existing={recipients}
        onClose={() => setIsRecipientGridOpen(false)} onSaved={(saved) => {
          setRecipients((current) => [...current.filter((recipient) => !saved.some((item) => item.id === recipient.id)), ...saved]);
          setIsRecipientGridOpen(false);
          if (activeView === "records" && recordsDirty && !window.confirm("저장하지 않은 근무기록을 닫고 이동할까요?")) return; setActiveView("recipients"); setSelectedStatus("정보입력중"); setShowEnabledOnly(true);
          setSearchQuery(""); setSelectedAssignedUserId("all");
          showNotification(`${saved.length}명의 기본 정보를 저장했습니다. 이름을 눌러 상세 정보를 보완해 주세요.`);
        }} />}

      {selectedRecipient && (
        <div className="detail-backdrop" role="presentation" onClick={event=>{if(event.target===event.currentTarget)(()=>setSelectedRecipientId(null))();}}>
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
                  {selectedRecipient.isDraft ? "상세 정보 입력" : "전체 정보 수정"}
                </button>
                {isRecipientEnabled(selectedRecipient) ? (
                  <>
                    <button
                      type="button"
                      className="warning-button"
                      disabled={Boolean(selectedRecipient.isDraft)}
                      title={selectedRecipient.isDraft ? "상세 정보 등록 후 이용할 수 있습니다." : undefined}
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
              <span>{selectedRecipient.isDraft ? "정보 입력 중 · 상세 정보를 보완해 주세요" : selectedRecipient.longTermCareNumber}</span>
              <h2>{selectedRecipient.name}</h2>
              <p>
                {selectedRecipient.careGrade || "등급 미등록"} · 대표 연락자{" "}
                {selectedRecipient.representativeName || "미등록"}
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
                  onChange={(event) => void handleAssignedBackofficeUserUpdate(selectedRecipient, event.target.value)}
                  disabled={isSaving || assigningRecipientIds.includes(selectedRecipient.id)}
                >
                  <option value="">미배정</option>
                  {backofficeUsers.map((user) => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </label>
              {assigningRecipientIds.includes(selectedRecipient.id) && <small role="status">저장 중…</small>}
              {assignmentErrors[selectedRecipient.id] && <small className="assignment-error" role="alert">{assignmentErrors[selectedRecipient.id]}</small>}
            </div>

            <RecipientPlanPanel key={`plan-${selectedRecipient.id}`} recipientId={selectedRecipient.id} focusOnMount={recipientView==='plan'} initiallyEditing={planEditingRequested} onSaved={state=>{
              setRecipients(current=>current.map(r=>r.id===selectedRecipient.id?{...r,...(state.current?.notes??state.legacyNotes),planSummary:summarizePlan(state)}:r));
              showNotification('수급자 계획을 저장했습니다.');
            }} />
            <RecipientServicePeriod key={`period-${selectedRecipient.id}`} recipient={selectedRecipient} onSaved={saved=>{setRecipients(current=>current.map(r=>r.id===saved.id?saved:r));showNotification('계약 기간을 저장했습니다.');}} />
            <RecipientDocuments key={selectedRecipient.id} recipientId={selectedRecipient.id} recipientName={selectedRecipient.name} />

            <div className="detail-sections">
              {detailSections.map((section) => (
                <section key={section.title}>
                  <h3>{section.title}</h3>
                  <dl>
                    {section.fields.map((field) => (
                      <div key={field.label}>
                        <dt>{field.label}</dt>
                        <dd>{field.value(selectedRecipient) || "미등록"}</dd>
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
        <div className="detail-backdrop" role="presentation" onClick={event=>{if(event.target===event.currentTarget)(()=>setSelectedEmploymentContractId(null))();}}>
          <article
            className={`detail-panel ${
              getEmploymentContractStatus(selectedEmploymentContract, employmentCurrentYear).valid ? "" : "is-disabled-detail"
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
                <button type="button" className="secondary-button"
                  onClick={() => openEmploymentRenewalPanel(selectedEmploymentContract, true)}>
                  <Pencil size={17} />
                  {selectedEmploymentContract.isDraft ? "상세 정보 입력" : "계약 수정"}
                </button>
                <button type="button" className="primary-button"
                  disabled={Boolean(selectedEmploymentContract.isDraft)}
                  title={selectedEmploymentContract.isDraft ? "상세 정보 등록 후 갱신할 수 있습니다." : undefined}
                  onClick={() => openEmploymentRenewalPanel(selectedEmploymentContract)}>
                  <Plus size={17} />
                  추가/갱신계약
                </button>
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
              <span>{selectedEmploymentContract.isDraft ? "정보 입력 중 · 상세 정보를 보완해 주세요" : `계약 조건 ${selectedEmploymentContract.contractTerms.length || 1}개`}</span>
              <h2>{selectedEmploymentContract.workerName}</h2>
              <p>
                {getEmploymentBirthDate(selectedEmploymentContract) || "생년월일 미등록"} ·{" "}
                {formatEmploymentAge(selectedEmploymentContract) ?? "나이 미계산"} ·{" "}
                {selectedEmploymentContract.workerPhone ?? "전화번호 미등록"}
                <strong className="inactive-inline">{getEmploymentContractStatus(selectedEmploymentContract, employmentCurrentYear).label}</strong>
              </p>
              <div>
                <small>대표 금액</small>
                <strong>
                  {selectedEmploymentContract.isDraft && !(selectedEmploymentContract.contractTerms[0]?.wageAmount ?? selectedEmploymentContract.wageAmount)
                    ? "약정 미입력" : formatCurrency(selectedEmploymentContract.contractTerms[0]?.wageAmount ?? selectedEmploymentContract.wageAmount)}
                </strong>
              </div>
            </div>

            <section className="employment-history" aria-label="근로자 계약 이력">
              <h3>계약 이력 ({selectedWorkerHistory.length}건)</h3>
              {selectedWorkerHistory.map((history, index) => (
                <button type="button" className="employment-history-item" key={history.id}
                  aria-pressed={history.id === selectedEmploymentContract.id}
                  onClick={() => setSelectedEmploymentContractId(history.id)}>
                  <span>{formatEmploymentPeriod(history)}</span>
                  <span>{index === 0 ? "최신 계약" : "이전 계약"} · {getEmploymentContractStatus(history, employmentCurrentYear).label}</span>
                  <span>{history.id === selectedEmploymentContract.id ? "선택됨" : "상세 보기"}</span>
                </button>
              ))}
            </section>

            <EmploymentConditionsDetails contract={selectedEmploymentContract} recipients={recipients} />

            <EmploymentContractAttachments key={selectedEmploymentContract.id} />

            <div className="detail-sections">
              {employmentContractDetailSections.map((section) => (
                <section key={section.title}>
                  <h3>{section.title}</h3>
                  <dl>
                    {section.fields.map((field) => (
                      <div key={field.label}>
                        <dt>{field.label}</dt>
                        <dd>{field.value(selectedEmploymentContract) || "미등록"}</dd>
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
        <div className="detail-backdrop" role="presentation" onClick={event=>{if(event.target===event.currentTarget)(closeCreatePanel)();}}>
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

            <form className="recipient-form" noValidate onSubmit={handleCreateRecipient}>
              <div className="form-heading">
                <span className="eyebrow">{editingRecipientId ? "Edit recipient" : "New recipient"}</span>
                <h2>{editingRecipientId ? "수급자 정보 수정" : "수급자 등록"}</h2>
              </div>

              {recipients.find((recipient) => recipient.id === editingRecipientId)?.isDraft && (
                <p className="condition-review">정보 입력 중인 수급자입니다. 입력한 내용 임시 저장으로 나누어 저장할 수 있으며, 필수 정보를 채운 뒤 상세 정보 등록 완료를 눌러 주세요.</p>
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
                    <DateInput
                      {...dateInputLimits}
                      value={formState.birthDate}
                      onChange={(event) => updateFormField("birthDate", event.target.value)}
                      required />
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
                      <option value="">등급 선택 / 미등록</option>
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
                  <p className="wide-field condition-review">병력·건강 메모와 구인조건은 수급자 상세의 ‘계획 작성·변경’에서 수정합니다. 적용일과 사유를 함께 남겨 이전 내용을 보관합니다.</p>
                  <label className="wide-field">
                    <span>수급자 관련 지인</span>
                    <textarea value={formState.relatedPeople} onChange={(event) => updateFormField("relatedPeople", event.target.value)} placeholder="예: 홍길동(이웃) 010-0000-0000" />
                  </label>
                  <label>
                    <span>장기요양이용계약 시작일</span>
                    <DateInput
                      {...dateInputLimits}
                      value={formState.serviceStartDate}
                      onChange={(event) => updateFormField("serviceStartDate", event.target.value)}
                      required />
                  </label>
                  <label>
                    <span>장기요양이용계약 만료일</span>
                    <DateInput
                      {...dateInputLimits}
                      value={formState.serviceEndDate}
                      onChange={(event) => updateFormField("serviceEndDate", event.target.value)}
                      required />
                  </label>
                </div>
              </section>

              {formErrorMessage && <div ref={formErrorRef} tabIndex={-1} className="form-error" role="alert"><AlertTriangle size={18} />{formErrorMessage}</div>}
              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={closeCreatePanel}>
                  취소
                </button>
                {(!editingRecipientId || recipients.find((recipient) => recipient.id === editingRecipientId)?.isDraft) && (
                  <button type="button" className="secondary-button" disabled={isSaving}
                    onClick={() => void handleCreateRecipient(undefined, true)}><Save size={16} /> 입력한 내용 임시 저장</button>
                )}
                <button type="submit" className="primary-button" disabled={isSaving}>
                  <Save size={18} />
                  {isSaving ? "저장 중" : recipients.find((recipient) => recipient.id === editingRecipientId)?.isDraft ? "상세 정보 등록 완료" : editingRecipientId ? "수정 저장" : "저장"}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}

      {isEmploymentCreatePanelOpen && (
        <div className="detail-backdrop" role="presentation" onClick={event=>{if(event.target===event.currentTarget)(closeEmploymentCreatePanel)();}}>
          <article className="detail-panel" aria-label={isEditingEmploymentContract ? "근로계약 수정" : employmentRenewalSource ? "추가/갱신계약 작성" : "근로계약 등록"}>
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
                <span className="eyebrow">{isEditingEmploymentContract ? "Edit employment contract" : employmentRenewalSource ? "Renew employment contract" : "New employment contract"}</span>
                <h2>{isEditingEmploymentContract ? "근로계약 수정" : employmentRenewalSource ? "추가/갱신계약 작성" : "근로계약 등록"}</h2>
              </div>

              {employmentRenewalSource?.isDraft && <p className="condition-review">정보 입력 중인 계약입니다. 임시 저장으로 나누어 보완하고, 필수 정보와 근무 조건을 채운 뒤 상세 정보 등록 완료를 눌러 주세요.</p>}

              {employmentRenewalSource && (
                <p>{employmentRenewalSource.workerName}님의 {formatEmploymentPeriod(employmentRenewalSource)} 계약 정보를 불러왔습니다.
                  {isEditingEmploymentContract ? employmentRenewalSource.isDraft ? "아는 만큼 입력한 뒤 임시 저장할 수 있습니다." : "내용을 수정한 뒤 저장하세요." : "내용을 확인하고 새 계약 기간을 입력하세요."}</p>
              )}

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

              <section className="form-section" aria-labelledby="employment-period-title">
                <h3 id="employment-period-title">계약 기간</h3>
                <div className="form-grid">
                  <label><span>계약 시작일</span>
                    <DateInput {...dateInputLimits} required value={employmentFormState.contractStartDate}
                      onChange={(event) => updateEmploymentFormField("contractStartDate", limitDateYear(event.target.value))} />
                  </label>
                  <label><span>계약 종료일</span>
                    <DateInput {...dateInputLimits} min={employmentFormState.contractStartDate || dateInputLimits.min}
                      required value={employmentFormState.contractEndDate}
                      onChange={(event) => updateEmploymentFormField("contractEndDate", limitDateYear(event.target.value))} />
                  </label>
                </div>
                {employmentFormState.contractStartDate && employmentFormState.contractEndDate &&
                  <p>{formatEmploymentPeriod(employmentFormState)}</p>}
              </section>

              <EmploymentConditionsEditor detailed={includeWorkConditions} onEnable={() => setIncludeWorkConditions(true)}
                terms={employmentFormState.terms} recipients={recipients}
                startDate={employmentFormState.contractStartDate} endDate={employmentFormState.contractEndDate}
                monthlyTravelAllowance={employmentFormState.monthlyTravelAllowance}
                onTravelChange={(value) => updateEmploymentFormField("monthlyTravelAllowance", value)}
                onAdd={addEmploymentTerm} onRemove={removeEmploymentTerm}
                onTermChange={updateEmploymentTermField} onConditionChange={updateEmploymentCondition} />

              <div className="form-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeEmploymentCreatePanel}
                >
                  취소
                </button>
                {(!isEditingEmploymentContract || employmentRenewalSource?.isDraft) && (
                  <button type="button" className="secondary-button" disabled={isEmploymentSaving}
                    onClick={() => void handleCreateEmploymentContract(undefined, true)}><Save size={16} /> 입력한 내용 임시 저장</button>
                )}
                <button type="submit" className="primary-button" disabled={isEmploymentSaving}>
                  <Save size={18} />
                  {isEmploymentSaving ? "저장 중" : employmentRenewalSource?.isDraft ? "상세 정보 등록 완료" : "저장"}
                </button>
              </div>
            </form>
          </article>
        </div>
      )}

      {recipientToDeactivate && (
        <div className="alert-backdrop" role="presentation" onClick={event=>{if(event.target===event.currentTarget)(()=>setRecipientToDeactivate(null))();}}>
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
        <div className="alert-backdrop" role="presentation" onClick={event=>{if(event.target===event.currentTarget)(()=>setEmploymentContractToDeactivate(null))();}}>
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
        <div className="alert-backdrop" role="presentation" onClick={event=>{if(event.target===event.currentTarget)(closeTerminateDialog)();}}>
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
              <DateInput
                {...dateInputLimits}
                value={terminationExpiredDate}
                min={recipientToTerminate.serviceStartDate}
                onChange={(event) => {
                  setTerminationExpiredDate(limitDateYear(event.target.value));
                  setTerminationErrorMessage(null);
                }} />
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
        <div className="alert-backdrop" role="presentation" onClick={event=>{if(event.target===event.currentTarget)(closeRestoreDialog)();}}>
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
                  <DateInput
                    {...dateInputLimits}
                    value={restoreFormState.serviceStartDate}
                    onChange={(event) =>
                      updateRestoreField("serviceStartDate", event.target.value)
                    } />
                </label>
                <label className="alert-field">
                  <span>장기요양이용계약 만료일</span>
                  <DateInput
                    {...dateInputLimits}
                    value={restoreFormState.serviceEndDate}
                    onChange={(event) => updateRestoreField("serviceEndDate", event.target.value)} />
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
