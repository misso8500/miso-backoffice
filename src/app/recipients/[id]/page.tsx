import Link from "next/link";
import { notFound } from "next/navigation";
import { getRecipientById, getRecipients } from "@/lib/recipients";
import styles from "./recipient-detail.module.css";

type RecipientDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

const sections = [
  {
    title: "기본 정보",
    fields: [
      ["수급자 이름", "name"],
      ["생년월일", "birthDate"],
      ["장기요양인정번호", "longTermCareNumber"],
      ["장기요양등급", "careGrade"],
      ["수급자 연락처", "phone"],
      ["수급자 주소", "address"]
    ]
  },
  {
    title: "대표 연락자",
    fields: [
      ["대표 연락자 이름", "representativeName"],
      ["대표 연락자 관계", "representativeRelation"],
      ["대표 연락자 연락처", "representativePhone"]
    ]
  },
  {
    title: "계약 정보",
    fields: [
      ["장기요양제공시작일", "serviceStartDate"],
      ["장기요양제공종료일", "serviceEndDate"],
      ["장기요양급여계약등록일", "contractRegisteredDate"],
      ["장기요양급여계약만료일", "contractExpiredDate"]
    ]
  },
  {
    title: "관리 정보",
    fields: [
      ["생성일시", "createdAt"],
      ["수정일시", "updatedAt"]
    ]
  }
] as const;

export function generateStaticParams() {
  return getRecipients().map((recipient) => ({
    id: recipient.id
  }));
}

export default async function RecipientDetailPage({
  params
}: RecipientDetailPageProps) {
  const { id } = await params;
  const recipient = getRecipientById(id);

  if (!recipient) {
    notFound();
  }

  return (
    <main className={styles.page}>
      <Link className={styles.backLink} href="/recipients">
        목록으로 돌아가기
      </Link>

      <section className={styles.header}>
        <div>
          <p className={styles.kicker}>수급자 상세</p>
          <h1>{recipient.name}</h1>
        </div>
        <div className={styles.summary}>
          <span>{recipient.careGrade}</span>
          <strong>{recipient.contractExpiredDate}</strong>
        </div>
      </section>

      <div className={styles.sections}>
        {sections.map((section) => (
          <section className={styles.section} key={section.title}>
            <h2>{section.title}</h2>
            <dl className={styles.definitionList}>
              {section.fields.map(([label, key]) => (
                <div className={styles.field} key={key}>
                  <dt>{label}</dt>
                  <dd>{recipient[key] ?? "미등록"}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </main>
  );
}
