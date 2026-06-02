import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecipientById } from "@/features/recipients/data";
import type { Recipient } from "@/features/recipients/types";

type RecipientDetailPageProps = {
  params: {
    id: string;
  };
};

const sections: Array<{
  title: string;
  fields: Array<{
    label: string;
    value: (recipient: Recipient) => string | undefined;
  }>;
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
      { label: "대표 연락자 이름", value: (recipient) => recipient.representativeName },
      { label: "대표 연락자 관계", value: (recipient) => recipient.representativeRelation },
      { label: "대표 연락자 연락처", value: (recipient) => recipient.representativePhone }
    ]
  },
  {
    title: "계약 및 제공 기간",
    fields: [
      { label: "장기요양제공시작일", value: (recipient) => recipient.serviceStartDate },
      { label: "장기요양제공종료일", value: (recipient) => recipient.serviceEndDate },
      { label: "장기요양급여계약등록일", value: (recipient) => recipient.contractRegisteredDate },
      { label: "장기요양급여계약만료일", value: (recipient) => recipient.contractExpiredDate }
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

export default function RecipientDetailPage({ params }: RecipientDetailPageProps) {
  const recipient = getRecipientById(params.id);

  if (!recipient) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-5 py-6 text-[#1d2433] sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/"
          className="mb-5 inline-flex text-sm font-medium text-[#49624f] hover:text-[#263a2d]"
        >
          목록으로 돌아가기
        </Link>

        <header className="mb-6 border-b border-[#d9dee8] pb-5">
          <p className="text-sm font-medium text-[#667085]">{recipient.longTermCareNumber}</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{recipient.name}</h1>
              <p className="mt-2 text-sm text-[#667085]">
                {recipient.careGrade} · 대표 연락자 {recipient.representativeName}
              </p>
            </div>
            <div className="border-l-4 border-[#8a6f38] bg-white px-4 py-3 text-sm">
              <span className="block text-[#667085]">계약만료일</span>
              <strong className="mt-1 block text-lg text-[#5f4d24]">
                {recipient.contractExpiredDate}
              </strong>
            </div>
          </div>
        </header>

        <div className="grid gap-5">
          {sections.map((section) => (
            <section key={section.title} aria-labelledby={`${section.title}-title`}>
              <h2 id={`${section.title}-title`} className="mb-3 text-lg font-semibold">
                {section.title}
              </h2>
              <dl className="grid border border-[#d9dee8] bg-white sm:grid-cols-2">
                {section.fields.map((field) => (
                  <div
                    key={field.label}
                    className="min-h-20 border-b border-[#e5e8ee] px-4 py-4 last:border-b-0 sm:border-r sm:[&:nth-last-child(-n+2)]:border-b-0 sm:[&:nth-child(2n)]:border-r-0"
                  >
                    <dt className="text-sm font-medium text-[#667085]">{field.label}</dt>
                    <dd className="mt-2 break-words text-base font-medium">
                      {field.value(recipient) ?? "미등록"}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
