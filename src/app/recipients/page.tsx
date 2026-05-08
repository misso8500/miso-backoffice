import Link from "next/link";
import { getRecipients } from "@/lib/recipients";
import styles from "./recipients.module.css";

export default function RecipientsPage() {
  const recipients = getRecipients();

  return (
    <main className={styles.page}>
      <section className={styles.header}>
        <div>
          <p className={styles.kicker}>수급자 관리</p>
          <h1>수급자 목록</h1>
        </div>
        <p className={styles.count}>총 {recipients.length}명</p>
      </section>

      <section className={styles.tableWrap} aria-label="수급자 목록">
        <div className={styles.tableHeader}>
          <span>수급자</span>
          <span>등급</span>
          <span>연락처</span>
          <span>대표 연락자</span>
          <span>대표 연락처</span>
          <span>계약 만료일</span>
        </div>

        {recipients.map((recipient) => (
          <Link
            className={styles.row}
            href={`/recipients/${recipient.id}`}
            key={recipient.id}
          >
            <span className={styles.name}>{recipient.name}</span>
            <span>{recipient.careGrade}</span>
            <span>{recipient.phone ?? "미등록"}</span>
            <span>{recipient.representativeName}</span>
            <span>{recipient.representativePhone}</span>
            <span>{recipient.contractExpiredDate}</span>
          </Link>
        ))}
      </section>
    </main>
  );
}
