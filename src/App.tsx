import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  ChevronRight,
  Database,
  RefreshCw,
  Search,
  Users,
  X
} from "lucide-react";
import { loadRecipients } from "./storage";
import type { Recipient } from "./types";

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
      { label: "내부 ID", value: (recipient) => recipient.id },
      { label: "생성일시", value: (recipient) => recipient.createdAt },
      { label: "수정일시", value: (recipient) => recipient.updatedAt }
    ]
  }
];

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));

function App() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  useEffect(() => {
    void fetchRecipients();
  }, [fetchRecipients]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedRecipientId(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filteredRecipients = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();

    return [...recipients]
      .filter((recipient) => {
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
  }, [recipients, searchQuery]);

  const selectedRecipient =
    recipients.find((recipient) => recipient.id === selectedRecipientId) ?? null;

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">
            <Users size={22} />
          </span>
          <div>
            <strong>Miso Backoffice</strong>
            <span>수급자 관리 MVP</span>
          </div>
        </div>
        <div className="runtime-badge">
          <Database size={16} />
          로컬 SQLite
        </div>
      </header>

      <main className="main-content">
        <section className="page-heading">
          <div>
            <span className="eyebrow">Recipients</span>
            <h1>수급자 관리</h1>
            <p>기본 정보와 계약 만료일을 확인합니다.</p>
          </div>
          <div className="summary-card">
            <span>등록 수급자</span>
            <strong>{recipients.length}명</strong>
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

          {isLoading ? (
            <div className="empty-state">
              <RefreshCw className="spin" size={28} />
              <p>수급자 정보를 불러오는 중입니다.</p>
            </div>
          ) : filteredRecipients.length === 0 ? (
            <div className="empty-state">
              <Users size={30} />
              <p>{searchQuery ? "검색 결과가 없습니다." : "등록된 수급자가 없습니다."}</p>
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
                      className="recipient-row"
                      onClick={() => setSelectedRecipientId(recipient.id)}
                    >
                      <span className="recipient-name">
                        <strong>{recipient.name}</strong>
                        <small>{recipient.longTermCareNumber}</small>
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
      </main>

      {selectedRecipient && (
        <div className="detail-backdrop" role="presentation">
          <article className="detail-panel" aria-label={`${selectedRecipient.name} 상세 정보`}>
            <div className="detail-header">
              <button
                type="button"
                className="back-button"
                onClick={() => setSelectedRecipientId(null)}
              >
                <ArrowLeft size={17} />
                목록으로
              </button>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelectedRecipientId(null)}
              >
                <X size={20} />
                <span className="sr-only">닫기</span>
              </button>
            </div>

            <div className="recipient-hero">
              <span>{selectedRecipient.longTermCareNumber}</span>
              <h2>{selectedRecipient.name}</h2>
              <p>
                {selectedRecipient.careGrade} · 대표 연락자{" "}
                {selectedRecipient.representativeName}
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
    </div>
  );
}

export default App;
