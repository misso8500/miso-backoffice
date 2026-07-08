import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Briefcase,
  CalendarClock,
  ChevronRight,
  Database,
  ClipboardCheck,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  FileX2,
  Trash2,
  Users,
  X
} from "lucide-react";
import {
  createEmploymentContract,
  createRecipient,
  loadEmploymentContracts,
  loadRecipients,
  restoreRecipient,
  terminateContract,
  updateEmploymentContract,
  updateRecipient
} from "./storage";
import type {
  ContractRestoreType,
  EmploymentContract,
  EmploymentContractInput,
  Recipient,
  RecipientInput
} from "./types";

type RecipientFormState = {
  name: string;
  birthDate: string;
  longTermCareNumber: string;
  careGrade: string;
  phone: string;
  address: string;
  representativeName: string;
  representativeRelation: string;
  representativePhone: string;
  serviceStartDate: string;
  serviceEndDate: string;
  contractRegisteredDate: string;
  contractExpiredDate: string;
};

const emptyRecipientForm: RecipientFormState = {
  name: "",
  birthDate: "",
  longTermCareNumber: "",
  careGrade: "3등급",
  phone: "",
  address: "",
  representativeName: "",
  representativeRelation: "",
  representativePhone: "",
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
  workerBirthDate: string;
  workerPhone: string;
  workerAddress: string;
  jobTitle: string;
  employmentType: string;
  workplaceType: "office" | "recipient_home";
  workplace: string;
  recipientAssignmentIds: string[];
  contractStartDate: string;
  contractEndDate: string;
  workDays: string;
  workStartTime: string;
  workEndTime: string;
  breakMinutes: string;
  wageType: string;
  wageAmount: string;
  nonTaxableVehicleAllowance: string;
  nonTaxableMealAllowance: string;
  taxableExtraPay: string;
  allowanceMemo: string;
  paymentDate: string;
  insuranceStatus: string;
  insuranceEffectiveStartDate: string;
  insuranceEffectiveEndDate: string;
  insuranceWeeklyHours: string;
  insuranceMemo: string;
  memo: string;
};

const emptyEmploymentContractForm: EmploymentContractFormState = {
  workerName: "",
  workerBirthDate: "",
  workerPhone: "",
  workerAddress: "",
  jobTitle: "요양보호사",
  employmentType: "기간의 정함이 있는 근로계약",
  workplaceType: "office",
  workplace: "",
  recipientAssignmentIds: [],
  contractStartDate: "",
  contractEndDate: "",
  workDays: "월,화,수,목,금",
  workStartTime: "09:00",
  workEndTime: "18:00",
  breakMinutes: "60",
  wageType: "월급",
  wageAmount: "",
  nonTaxableVehicleAllowance: "0",
  nonTaxableMealAllowance: "0",
  taxableExtraPay: "0",
  allowanceMemo: "",
  paymentDate: "매월 10일",
  insuranceStatus: "4대보험 가입",
  insuranceEffectiveStartDate: "",
  insuranceEffectiveEndDate: "",
  insuranceWeeklyHours: "40",
  insuranceMemo: "",
  memo: ""
};

const requiredFormFields: Array<{ key: keyof RecipientFormState; label: string }> = [
  { key: "name", label: "수급자 이름" },
  { key: "birthDate", label: "생년월일" },
  { key: "longTermCareNumber", label: "장기요양인정번호" },
  { key: "careGrade", label: "장기요양등급" },
  { key: "address", label: "수급자 주소" },
  { key: "representativeName", label: "대표 연락자 이름" },
  { key: "representativeRelation", label: "대표 연락자 관계" },
  { key: "representativePhone", label: "대표 연락자 연락처" },
  { key: "serviceStartDate", label: "장기요양 제공 시작일" },
  { key: "serviceEndDate", label: "장기요양 제공 종료일" },
  { key: "contractRegisteredDate", label: "급여 계약 등록일" },
  { key: "contractExpiredDate", label: "급여 계약 만료일" }
];

const requiredEmploymentContractFields: Array<{
  key: keyof EmploymentContractFormState;
  label: string;
}> = [
  { key: "workerName", label: "근로자 이름" },
  { key: "workerBirthDate", label: "근로자 생년월일" },
  { key: "workerAddress", label: "근로자 주소" },
  { key: "jobTitle", label: "직무" },
  { key: "employmentType", label: "계약 형태" },
  { key: "contractStartDate", label: "계약 시작일" },
  { key: "workDays", label: "근무일" },
  { key: "workStartTime", label: "근무 시작시각" },
  { key: "workEndTime", label: "근무 종료시각" },
  { key: "breakMinutes", label: "휴게시간" },
  { key: "wageType", label: "임금 형태" },
  { key: "wageAmount", label: "임금 금액" },
  { key: "paymentDate", label: "임금 지급일" },
  { key: "insuranceStatus", label: "사회보험 적용" },
  { key: "insuranceEffectiveStartDate", label: "보험 적용 시작일" },
  { key: "insuranceWeeklyHours", label: "보험 산정 주당 근무시간" }
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
    title: "계약 및 제공 기간",
    fields: [
      { label: "장기요양 제공 시작일", value: (recipient) => recipient.serviceStartDate },
      { label: "장기요양 제공 종료일", value: (recipient) => recipient.serviceEndDate },
      { label: "급여 계약 등록일", value: (recipient) => recipient.contractRegisteredDate },
      { label: "급여 계약 만료일", value: (recipient) => recipient.contractExpiredDate }
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
    title: "근로자 정보",
    fields: [
      { label: "근로자 이름", value: (contract) => contract.workerName },
      { label: "생년월일", value: (contract) => contract.workerBirthDate },
      { label: "연락처", value: (contract) => contract.workerPhone },
      { label: "주소", value: (contract) => contract.workerAddress }
    ]
  },
  {
    title: "계약 정보",
    fields: [
      { label: "직무", value: (contract) => contract.jobTitle },
      { label: "계약 형태", value: (contract) => contract.employmentType },
      {
        label: "근무 장소 유형",
        value: (contract) => (contract.workplaceType === "recipient_home" ? "수급자 댁" : "사무실")
      },
      { label: "근무 장소", value: (contract) => contract.workplace },
      { label: "매핑 수급자", value: (contract) => formatRecipientAssignments(contract) },
      { label: "계약 시작일", value: (contract) => contract.contractStartDate },
      { label: "계약 종료일", value: (contract) => contract.contractEndDate }
    ]
  },
  {
    title: "근무 및 임금",
    fields: [
      { label: "근무일", value: (contract) => contract.workDays },
      {
        label: "근무시간",
        value: (contract) => `${contract.workStartTime} - ${contract.workEndTime}`
      },
      { label: "휴게시간", value: (contract) => `${contract.breakMinutes}분` },
      {
        label: "임금",
        value: (contract) =>
          `${contract.wageType} ${contract.wageAmount.toLocaleString("ko-KR")}원`
      },
      {
        label: "비과세 차량수당",
        value: (contract) => formatCurrency(contract.nonTaxableVehicleAllowance)
      },
      {
        label: "비과세 식대",
        value: (contract) => formatCurrency(contract.nonTaxableMealAllowance)
      },
      { label: "기타 과세수당", value: (contract) => formatCurrency(contract.taxableExtraPay) },
      { label: "수당 메모", value: (contract) => contract.allowanceMemo },
      { label: "임금 지급일", value: (contract) => contract.paymentDate },
      { label: "현재 사회보험 적용", value: (contract) => contract.insuranceStatus }
    ]
  },
  {
    title: "보험 상태 기록",
    fields: [
      { label: "보험 스냅샷", value: (contract) => formatInsuranceSnapshots(contract) }
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

const formatRecipientAssignments = (contract: EmploymentContract) =>
  contract.recipientAssignments.length > 0
    ? contract.recipientAssignments
        .map((assignment) => assignment.recipientName ?? assignment.recipientId)
        .join(", ")
    : undefined;

const formatInsuranceSnapshots = (contract: EmploymentContract) =>
  contract.insuranceSnapshots.length > 0
    ? contract.insuranceSnapshots
        .map((snapshot) => {
          const period = snapshot.effectiveEndDate
            ? `${snapshot.effectiveStartDate} ~ ${snapshot.effectiveEndDate}`
            : `${snapshot.effectiveStartDate} ~`;
          return `${period} · ${snapshot.status} · 주 ${snapshot.weeklyHours}시간`;
        })
        .join("\n")
    : undefined;

const isRecipientEnabled = (recipient: Recipient) => recipient.enabled !== false;

function App() {
  const [activeView, setActiveView] = useState<"recipients" | "employmentContracts">(
    "recipients"
  );
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showEnabledOnly, setShowEnabledOnly] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreatePanelOpen, setIsCreatePanelOpen] = useState(false);
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

  useEffect(() => {
    void fetchRecipients();
    void fetchEmploymentContracts();
  }, [fetchEmploymentContracts, fetchRecipients]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedRecipientId(null);
        setIsCreatePanelOpen(false);
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

        if (!query) {
          return true;
        }

        return [
          recipient.name,
          recipient.longTermCareNumber,
          recipient.careGrade,
          recipient.phone,
          recipient.representativeName,
          recipient.representativePhone
        ]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase()
          .includes(query);
      })
      .sort((a, b) => a.contractExpiredDate.localeCompare(b.contractExpiredDate));
  }, [recipients, searchQuery, showEnabledOnly]);

  const selectedRecipient =
    recipients.find((recipient) => recipient.id === selectedRecipientId) ?? null;
  const enabledRecipientCount = recipients.filter(isRecipientEnabled).length;
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
          contract.jobTitle,
          contract.employmentType,
          contract.workplace,
          ...contract.recipientAssignments.map(
            (assignment) => assignment.recipientName ?? assignment.recipientId
          ),
          contract.insuranceStatus
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
    setFormState((current) => ({ ...current, [field]: value }));
    setFormErrorMessage(null);
  };

  const updateEmploymentFormField = (field: keyof EmploymentContractFormState, value: string) => {
    setEmploymentFormState((current) => ({ ...current, [field]: value }));
    setEmploymentFormErrorMessage(null);
  };

  const toggleEmploymentRecipientAssignment = (recipientId: string) => {
    setEmploymentFormState((current) => {
      const recipientAssignmentIds = current.recipientAssignmentIds.includes(recipientId)
        ? current.recipientAssignmentIds.filter((id) => id !== recipientId)
        : [...current.recipientAssignmentIds, recipientId];

      return { ...current, recipientAssignmentIds };
    });
    setEmploymentFormErrorMessage(null);
  };

  const closeCreatePanel = () => {
    setIsCreatePanelOpen(false);
    setFormState(emptyRecipientForm);
    setFormErrorMessage(null);
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
      setFormErrorMessage("장기요양 제공 시작일은 종료일보다 늦을 수 없습니다.");
      return;
    }

    if (formState.contractRegisteredDate > formState.contractExpiredDate) {
      setFormErrorMessage("급여 계약 등록일은 만료일보다 늦을 수 없습니다.");
      return;
    }

    const newRecipient: RecipientInput = {
      id: createRecipientId(),
      name: formState.name.trim(),
      birthDate: formState.birthDate,
      longTermCareNumber: formState.longTermCareNumber.trim(),
      careGrade: formState.careGrade.trim(),
      ...(formState.phone.trim() ? { phone: formState.phone.trim() } : {}),
      address: formState.address.trim(),
      representativeName: formState.representativeName.trim(),
      representativeRelation: formState.representativeRelation.trim(),
      representativePhone: formState.representativePhone.trim(),
      serviceStartDate: formState.serviceStartDate,
      serviceEndDate: formState.serviceEndDate,
      contractRegisteredDate: formState.contractRegisteredDate,
      contractExpiredDate: formState.contractExpiredDate,
      enabled: true
    };

    setIsSaving(true);

    try {
      const createdRecipient = await createRecipient(newRecipient);
      setRecipients((current) => [...current, createdRecipient]);
      setSelectedRecipientId(createdRecipient.id);
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

    if (employmentFormState.workplaceType === "office" && !employmentFormState.workplace.trim()) {
      setEmploymentFormErrorMessage("사무실 근무 장소를 입력하세요.");
      return;
    }

    if (
      employmentFormState.workplaceType === "recipient_home" &&
      employmentFormState.recipientAssignmentIds.length === 0
    ) {
      setEmploymentFormErrorMessage("수급자 댁 근무는 관련 수급자를 1명 이상 선택하세요.");
      return;
    }

    if (
      employmentFormState.contractEndDate &&
      employmentFormState.contractStartDate > employmentFormState.contractEndDate
    ) {
      setEmploymentFormErrorMessage("계약 시작일은 종료일보다 늦을 수 없습니다.");
      return;
    }

    if (employmentFormState.workStartTime >= employmentFormState.workEndTime) {
      setEmploymentFormErrorMessage("근무 시작시각은 종료시각보다 빨라야 합니다.");
      return;
    }

    const breakMinutes = Number(employmentFormState.breakMinutes);
    const wageAmount = Number(employmentFormState.wageAmount);
    const nonTaxableVehicleAllowance = Number(employmentFormState.nonTaxableVehicleAllowance || 0);
    const nonTaxableMealAllowance = Number(employmentFormState.nonTaxableMealAllowance || 0);
    const taxableExtraPay = Number(employmentFormState.taxableExtraPay || 0);
    const insuranceWeeklyHours = Number(employmentFormState.insuranceWeeklyHours);

    if (!Number.isFinite(breakMinutes) || breakMinutes < 0) {
      setEmploymentFormErrorMessage("휴게시간은 0분 이상의 숫자로 입력하세요.");
      return;
    }

    if (!Number.isFinite(wageAmount) || wageAmount <= 0) {
      setEmploymentFormErrorMessage("임금 금액은 0보다 큰 숫자로 입력하세요.");
      return;
    }

    if (
      [nonTaxableVehicleAllowance, nonTaxableMealAllowance, taxableExtraPay].some(
        (value) => !Number.isFinite(value) || value < 0
      )
    ) {
      setEmploymentFormErrorMessage("수당 금액은 0 이상의 숫자로 입력하세요.");
      return;
    }

    if (!Number.isFinite(insuranceWeeklyHours) || insuranceWeeklyHours < 0) {
      setEmploymentFormErrorMessage("보험 산정 주당 근무시간은 0 이상의 숫자로 입력하세요.");
      return;
    }

    if (
      employmentFormState.insuranceEffectiveEndDate &&
      employmentFormState.insuranceEffectiveStartDate > employmentFormState.insuranceEffectiveEndDate
    ) {
      setEmploymentFormErrorMessage("보험 적용 시작일은 종료일보다 늦을 수 없습니다.");
      return;
    }

    const mappedRecipientNames = recipients
      .filter((recipient) => employmentFormState.recipientAssignmentIds.includes(recipient.id))
      .map((recipient) => recipient.name);

    const newContract: EmploymentContractInput = {
      id: createEmploymentContractId(),
      workerName: employmentFormState.workerName.trim(),
      workerBirthDate: employmentFormState.workerBirthDate,
      ...(employmentFormState.workerPhone.trim()
        ? { workerPhone: employmentFormState.workerPhone.trim() }
        : {}),
      workerAddress: employmentFormState.workerAddress.trim(),
      jobTitle: employmentFormState.jobTitle.trim(),
      employmentType: employmentFormState.employmentType.trim(),
      workplaceType: employmentFormState.workplaceType,
      workplace:
        employmentFormState.workplaceType === "recipient_home"
          ? mappedRecipientNames.length > 0
            ? `${mappedRecipientNames.join(", ")} 수급자 댁`
            : "수급자 댁"
          : employmentFormState.workplace.trim(),
      recipientAssignments: employmentFormState.recipientAssignmentIds.map((recipientId) => ({
        recipientId
      })),
      contractStartDate: employmentFormState.contractStartDate,
      ...(employmentFormState.contractEndDate
        ? { contractEndDate: employmentFormState.contractEndDate }
        : {}),
      workDays: employmentFormState.workDays.trim(),
      workStartTime: employmentFormState.workStartTime,
      workEndTime: employmentFormState.workEndTime,
      breakMinutes,
      wageType: employmentFormState.wageType.trim(),
      wageAmount,
      nonTaxableVehicleAllowance,
      nonTaxableMealAllowance,
      taxableExtraPay,
      ...(employmentFormState.allowanceMemo.trim()
        ? { allowanceMemo: employmentFormState.allowanceMemo.trim() }
        : {}),
      paymentDate: employmentFormState.paymentDate.trim(),
      insuranceStatus: employmentFormState.insuranceStatus.trim(),
      insuranceSnapshots: [
        {
          status: employmentFormState.insuranceStatus.trim(),
          effectiveStartDate: employmentFormState.insuranceEffectiveStartDate,
          ...(employmentFormState.insuranceEffectiveEndDate
            ? { effectiveEndDate: employmentFormState.insuranceEffectiveEndDate }
            : {}),
          weeklyHours: insuranceWeeklyHours,
          ...(employmentFormState.insuranceMemo.trim()
            ? { memo: employmentFormState.insuranceMemo.trim() }
            : {})
        }
      ],
      ...(employmentFormState.memo.trim() ? { memo: employmentFormState.memo.trim() } : {}),
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

  const handleDeactivateRecipient = async () => {
    if (!recipientToDeactivate) {
      return;
    }

    setIsDeactivating(true);
    setDeactivateErrorMessage(null);

    try {
      const updatedRecipient = await updateRecipient({
        ...recipientToDeactivate,
        enabled: false
      });

      setRecipients((current) =>
        current.map((recipient) =>
          recipient.id === updatedRecipient.id ? updatedRecipient : recipient
        )
      );
      setSelectedRecipientId(updatedRecipient.id);
      setRecipientToDeactivate(null);
      setErrorMessage(null);
    } catch (error) {
      setDeactivateErrorMessage(
        error instanceof Error ? error.message : "수급자를 비활성화하지 못했습니다."
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
    setTerminationExpiredDate(recipient.contractExpiredDate);
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
      setTerminationErrorMessage("급여 계약 만료일을 입력하세요.");
      return;
    }

    if (terminationExpiredDate < recipientToTerminate.contractRegisteredDate) {
      setTerminationErrorMessage("급여 계약 만료일은 계약 등록일보다 빠를 수 없습니다.");
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
    setRestoreFormState((current) => (current ? { ...current, [field]: value } : current));
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
        restoreFormState.serviceEndDate,
        restoreFormState.contractRegisteredDate,
        restoreFormState.contractExpiredDate
      ];

      if (requiredDates.some((value) => !value)) {
        setRestoreErrorMessage("재계약 날짜 정보를 모두 입력하세요.");
        return;
      }

      if (restoreFormState.serviceStartDate > restoreFormState.serviceEndDate) {
        setRestoreErrorMessage("장기요양 제공 시작일은 종료일보다 늦을 수 없습니다.");
        return;
      }

      if (restoreFormState.contractRegisteredDate > restoreFormState.contractExpiredDate) {
        setRestoreErrorMessage("급여 계약 등록일은 만료일보다 늦을 수 없습니다.");
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
              contractRegisteredDate: restoreFormState.contractRegisteredDate,
              contractExpiredDate: restoreFormState.contractExpiredDate
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
            <p>기본 정보와 계약 만료일을 기록하고 확인합니다.</p>
          </div>
          <div className="heading-actions">
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                setSelectedRecipientId(null);
                setIsCreatePanelOpen(true);
              }}
            >
              <Plus size={18} />
              수급자 등록
            </button>
            <div className="summary-card">
              <span>유효 수급자</span>
              <strong>{enabledRecipientCount}명</strong>
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

        <section aria-labelledby="recipient-list-title">
          <div className="list-toolbar">
            <div>
              <h2 id="recipient-list-title">수급자 목록</h2>
              <span>계약 만료일 오름차순</span>
            </div>
            <div className="toolbar-controls">
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
            <div className="recipient-table">
              <div className="table-head">
                <span>수급자</span>
                <span>등급</span>
                <span>수급자 연락처</span>
                <span>대표 연락자</span>
                <span>계약 만료일</span>
                <span aria-hidden="true" />
              </div>
              <ul>
                {filteredRecipients.map((recipient) => (
                  <li key={recipient.id}>
                    <button
                      type="button"
                      className={`recipient-row ${
                        isRecipientEnabled(recipient) ? "" : "is-disabled"
                      }`}
                      onClick={() => setSelectedRecipientId(recipient.id)}
                    >
                      <span className="recipient-name">
                        <strong>{recipient.name}</strong>
                        <small>
                          {recipient.longTermCareNumber}
                          {!isRecipientEnabled(recipient) && (
                            <em className="status-chip">비활성화</em>
                          )}
                        </small>
                      </span>
                      <span>{recipient.careGrade}</span>
                      <span>{recipient.phone ?? "미등록"}</span>
                      <span>
                        {recipient.representativeName}
                        <small>{recipient.representativePhone}</small>
                      </span>
                      <span className="expiry">
                        <CalendarClock size={15} />
                        {recipient.contractExpiredDate}
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
                      placeholder="이름, 직무, 수급자 검색"
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
                    <span>직무</span>
                    <span>계약 형태</span>
                    <span>근무 장소</span>
                    <span>계약 시작일</span>
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
                          <span>{contract.jobTitle}</span>
                          <span>{contract.employmentType}</span>
                          <span>
                            {contract.workplace}
                            <small>
                              {contract.workplaceType === "recipient_home"
                                ? formatRecipientAssignments(contract) ?? contract.workDays
                                : contract.workDays}
                            </small>
                          </span>
                          <span className="expiry">
                            <CalendarClock size={15} />
                            {contract.contractStartDate}
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
                <small>계약 만료일</small>
                <strong>{formatDate(selectedRecipient.contractExpiredDate)}</strong>
              </div>
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
              <span>{selectedEmploymentContract.employmentType}</span>
              <h2>{selectedEmploymentContract.workerName}</h2>
              <p>
                {selectedEmploymentContract.jobTitle} · {selectedEmploymentContract.workplace}
                {selectedEmploymentContract.workplaceType === "recipient_home" &&
                  ` · ${formatRecipientAssignments(selectedEmploymentContract) ?? "수급자 미매핑"}`}
                {!selectedEmploymentContract.enabled && (
                  <strong className="inactive-inline">비활성화된 계약</strong>
                )}
              </p>
              <div>
                <small>계약 시작일</small>
                <strong>{formatDate(selectedEmploymentContract.contractStartDate)}</strong>
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
          <article className="detail-panel" aria-label="수급자 등록">
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
                <span className="eyebrow">New recipient</span>
                <h2>수급자 등록</h2>
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
                    <span>생년월일</span>
                    <input
                      type="date"
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
                      onChange={(event) => updateFormField("phone", event.target.value)}
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
                        updateFormField("representativePhone", event.target.value)
                      }
                      required
                    />
                  </label>
                </div>
              </section>

              <section className="form-section" aria-labelledby="contract-form-title">
                <h3 id="contract-form-title">계약 및 제공 기간</h3>
                <div className="form-grid">
                  <label>
                    <span>장기요양 제공 시작일</span>
                    <input
                      type="date"
                      value={formState.serviceStartDate}
                      onChange={(event) => updateFormField("serviceStartDate", event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>장기요양 제공 종료일</span>
                    <input
                      type="date"
                      value={formState.serviceEndDate}
                      onChange={(event) => updateFormField("serviceEndDate", event.target.value)}
                      required
                    />
                  </label>
                  <label>
                    <span>급여 계약 등록일</span>
                    <input
                      type="date"
                      value={formState.contractRegisteredDate}
                      onChange={(event) =>
                        updateFormField("contractRegisteredDate", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>급여 계약 만료일</span>
                    <input
                      type="date"
                      value={formState.contractExpiredDate}
                      onChange={(event) =>
                        updateFormField("contractExpiredDate", event.target.value)
                      }
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
                  {isSaving ? "저장 중" : "저장"}
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
                    <span>생년월일</span>
                    <input
                      type="date"
                      value={employmentFormState.workerBirthDate}
                      onChange={(event) =>
                        updateEmploymentFormField("workerBirthDate", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>연락처</span>
                    <input
                      value={employmentFormState.workerPhone}
                      onChange={(event) =>
                        updateEmploymentFormField("workerPhone", event.target.value)
                      }
                    />
                  </label>
                  <label className="wide-field">
                    <span>주소</span>
                    <input
                      value={employmentFormState.workerAddress}
                      onChange={(event) =>
                        updateEmploymentFormField("workerAddress", event.target.value)
                      }
                      required
                    />
                  </label>
                </div>
              </section>

              <section className="form-section" aria-labelledby="employment-form-title">
                <h3 id="employment-form-title">계약 정보</h3>
                <div className="form-grid">
                  <label>
                    <span>직무</span>
                    <input
                      value={employmentFormState.jobTitle}
                      onChange={(event) =>
                        updateEmploymentFormField("jobTitle", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>계약 형태</span>
                    <select
                      value={employmentFormState.employmentType}
                      onChange={(event) =>
                        updateEmploymentFormField("employmentType", event.target.value)
                      }
                      required
                    >
                      <option>기간의 정함이 있는 근로계약</option>
                      <option>기간의 정함이 없는 근로계약</option>
                      <option>단시간 근로계약</option>
                      <option>일용 근로계약</option>
                    </select>
                  </label>
                  <label className="wide-field">
                    <span>근무 장소 유형</span>
                    <div className="segmented-control">
                      <button
                        type="button"
                        className={employmentFormState.workplaceType === "office" ? "is-active" : ""}
                        onClick={() => updateEmploymentFormField("workplaceType", "office")}
                      >
                        사무실
                      </button>
                      <button
                        type="button"
                        className={
                          employmentFormState.workplaceType === "recipient_home" ? "is-active" : ""
                        }
                        onClick={() =>
                          updateEmploymentFormField("workplaceType", "recipient_home")
                        }
                      >
                        수급자 댁
                      </button>
                    </div>
                  </label>
                  {employmentFormState.workplaceType === "office" ? (
                    <label className="wide-field">
                      <span>사무실 근무 장소</span>
                      <input
                        value={employmentFormState.workplace}
                        onChange={(event) =>
                          updateEmploymentFormField("workplace", event.target.value)
                        }
                        required
                      />
                    </label>
                  ) : (
                    <div className="wide-field recipient-picker">
                      <span>관련 수급자</span>
                      <div>
                        {recipients.filter(isRecipientEnabled).map((recipient) => (
                          <label key={recipient.id}>
                            <input
                              type="checkbox"
                              checked={employmentFormState.recipientAssignmentIds.includes(
                                recipient.id
                              )}
                              onChange={() => toggleEmploymentRecipientAssignment(recipient.id)}
                            />
                            <span>
                              <strong>{recipient.name}</strong>
                              <small>
                                {recipient.careGrade} · {recipient.address}
                              </small>
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                  <label>
                    <span>계약 시작일</span>
                    <input
                      type="date"
                      value={employmentFormState.contractStartDate}
                      onChange={(event) =>
                        updateEmploymentFormField("contractStartDate", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>계약 종료일</span>
                    <input
                      type="date"
                      value={employmentFormState.contractEndDate}
                      onChange={(event) =>
                        updateEmploymentFormField("contractEndDate", event.target.value)
                      }
                    />
                  </label>
                </div>
              </section>

              <section className="form-section" aria-labelledby="work-form-title">
                <h3 id="work-form-title">근무시간</h3>
                <div className="form-grid">
                  <label className="wide-field">
                    <span>근무일</span>
                    <input
                      value={employmentFormState.workDays}
                      onChange={(event) =>
                        updateEmploymentFormField("workDays", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>시작시각</span>
                    <input
                      type="time"
                      value={employmentFormState.workStartTime}
                      onChange={(event) =>
                        updateEmploymentFormField("workStartTime", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>종료시각</span>
                    <input
                      type="time"
                      value={employmentFormState.workEndTime}
                      onChange={(event) =>
                        updateEmploymentFormField("workEndTime", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>휴게시간(분)</span>
                    <input
                      type="number"
                      min="0"
                      value={employmentFormState.breakMinutes}
                      onChange={(event) =>
                        updateEmploymentFormField("breakMinutes", event.target.value)
                      }
                      required
                    />
                  </label>
                </div>
              </section>

              <section className="form-section" aria-labelledby="wage-form-title">
                <h3 id="wage-form-title">임금 및 보험</h3>
                <div className="form-grid">
                  <label>
                    <span>임금 형태</span>
                    <select
                      value={employmentFormState.wageType}
                      onChange={(event) =>
                        updateEmploymentFormField("wageType", event.target.value)
                      }
                      required
                    >
                      <option>월급</option>
                      <option>시급</option>
                      <option>일급</option>
                    </select>
                  </label>
                  <label>
                    <span>임금 금액</span>
                    <input
                      type="number"
                      min="1"
                      value={employmentFormState.wageAmount}
                      onChange={(event) =>
                        updateEmploymentFormField("wageAmount", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>비과세 차량수당</span>
                    <input
                      type="number"
                      min="0"
                      value={employmentFormState.nonTaxableVehicleAllowance}
                      onChange={(event) =>
                        updateEmploymentFormField(
                          "nonTaxableVehicleAllowance",
                          event.target.value
                        )
                      }
                    />
                  </label>
                  <label>
                    <span>비과세 식대</span>
                    <input
                      type="number"
                      min="0"
                      value={employmentFormState.nonTaxableMealAllowance}
                      onChange={(event) =>
                        updateEmploymentFormField("nonTaxableMealAllowance", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>기타 과세수당</span>
                    <input
                      type="number"
                      min="0"
                      value={employmentFormState.taxableExtraPay}
                      onChange={(event) =>
                        updateEmploymentFormField("taxableExtraPay", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>임금 지급일</span>
                    <input
                      value={employmentFormState.paymentDate}
                      onChange={(event) =>
                        updateEmploymentFormField("paymentDate", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>사회보험 적용</span>
                    <select
                      value={employmentFormState.insuranceStatus}
                      onChange={(event) =>
                        updateEmploymentFormField("insuranceStatus", event.target.value)
                      }
                      required
                    >
                      <option>4대보험 가입</option>
                      <option>고용/산재보험 가입</option>
                      <option>대상 아님</option>
                      <option>확인 필요</option>
                    </select>
                  </label>
                  <label>
                    <span>보험 적용 시작일</span>
                    <input
                      type="date"
                      value={employmentFormState.insuranceEffectiveStartDate}
                      onChange={(event) =>
                        updateEmploymentFormField(
                          "insuranceEffectiveStartDate",
                          event.target.value
                        )
                      }
                      required
                    />
                  </label>
                  <label>
                    <span>보험 적용 종료일</span>
                    <input
                      type="date"
                      value={employmentFormState.insuranceEffectiveEndDate}
                      onChange={(event) =>
                        updateEmploymentFormField("insuranceEffectiveEndDate", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    <span>보험 산정 주당 근무시간</span>
                    <input
                      type="number"
                      min="0"
                      value={employmentFormState.insuranceWeeklyHours}
                      onChange={(event) =>
                        updateEmploymentFormField("insuranceWeeklyHours", event.target.value)
                      }
                      required
                    />
                  </label>
                  <label className="wide-field">
                    <span>수당 메모</span>
                    <input
                      value={employmentFormState.allowanceMemo}
                      onChange={(event) =>
                        updateEmploymentFormField("allowanceMemo", event.target.value)
                      }
                    />
                  </label>
                  <label className="wide-field">
                    <span>보험 기록 메모</span>
                    <input
                      value={employmentFormState.insuranceMemo}
                      onChange={(event) =>
                        updateEmploymentFormField("insuranceMemo", event.target.value)
                      }
                    />
                  </label>
                  <label className="wide-field">
                    <span>메모</span>
                    <textarea
                      value={employmentFormState.memo}
                      onChange={(event) => updateEmploymentFormField("memo", event.target.value)}
                      rows={3}
                    />
                  </label>
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
              <h2 id="deactivate-title">수급자를 삭제 처리할까요?</h2>
              <p id="deactivate-description">
                {recipientToDeactivate.name} 수급자는 실제로 삭제되지 않고 비활성화 상태로
                표시됩니다.
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
                취소
              </button>
              <button
                type="button"
                className="danger-button"
                onClick={() => void handleDeactivateRecipient()}
                disabled={isDeactivating}
              >
                <Trash2 size={17} />
                {isDeactivating ? "처리 중" : "확인"}
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
                {recipientToTerminate.name} 수급자의 급여 계약 만료일을 기록하고 비활성화합니다.
              </p>
            </div>

            <label className="alert-field">
              <span>급여 계약 만료일</span>
              <input
                type="date"
                value={terminationExpiredDate}
                min={recipientToTerminate.contractRegisteredDate}
                onChange={(event) => {
                  setTerminationExpiredDate(event.target.value);
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
                  <span>장기요양 제공 시작일</span>
                  <input
                    type="date"
                    value={restoreFormState.serviceStartDate}
                    onChange={(event) =>
                      updateRestoreField("serviceStartDate", event.target.value)
                    }
                  />
                </label>
                <label className="alert-field">
                  <span>장기요양 제공 종료일</span>
                  <input
                    type="date"
                    value={restoreFormState.serviceEndDate}
                    onChange={(event) => updateRestoreField("serviceEndDate", event.target.value)}
                  />
                </label>
                <label className="alert-field">
                  <span>급여 계약 등록일</span>
                  <input
                    type="date"
                    value={restoreFormState.contractRegisteredDate}
                    onChange={(event) =>
                      updateRestoreField("contractRegisteredDate", event.target.value)
                    }
                  />
                </label>
                <label className="alert-field">
                  <span>급여 계약 만료일</span>
                  <input
                    type="date"
                    value={restoreFormState.contractExpiredDate}
                    onChange={(event) =>
                      updateRestoreField("contractExpiredDate", event.target.value)
                    }
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
