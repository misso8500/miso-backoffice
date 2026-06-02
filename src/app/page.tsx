import Link from "next/link";
import { sampleRecipients } from "@/features/recipients/data";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] px-5 py-6 text-[#1d2433] sm:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col gap-3 border-b border-[#d9dee8] pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#49624f]">Miso Backoffice</p>
            <h1 className="mt-1 text-2xl font-semibold">수급자 관리</h1>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:min-w-64">
            <div className="border-l-4 border-[#49715b] bg-white px-4 py-3">
              <dt className="text-[#667085]">등록 수급자</dt>
              <dd className="mt-1 text-xl font-semibold">{sampleRecipients.length}명</dd>
            </div>
            <div className="border-l-4 border-[#8a6f38] bg-white px-4 py-3">
              <dt className="text-[#667085]">조회 기준</dt>
              <dd className="mt-1 text-xl font-semibold">샘플</dd>
            </div>
          </dl>
        </header>

        <section aria-labelledby="recipient-list-title">
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 id="recipient-list-title" className="text-lg font-semibold">
              수급자 목록
            </h2>
            <span className="text-sm text-[#667085]">계약만료일 오름차순</span>
          </div>

          <div className="overflow-hidden border border-[#d9dee8] bg-white">
            <div className="hidden grid-cols-[1.2fr_0.7fr_1fr_1fr_1fr_0.9fr] border-b border-[#d9dee8] bg-[#eef1f5] px-4 py-3 text-sm font-semibold text-[#344054] lg:grid">
              <div>수급자</div>
              <div>등급</div>
              <div>수급자 연락처</div>
              <div>대표 연락자</div>
              <div>대표 연락처</div>
              <div>계약만료일</div>
            </div>

            <ul className="divide-y divide-[#e5e8ee]">
              {[...sampleRecipients]
                .sort((a, b) => a.contractExpiredDate.localeCompare(b.contractExpiredDate))
                .map((recipient) => (
                  <li key={recipient.id}>
                    <Link
                      href={`/recipients/${recipient.id}`}
                      className="grid gap-3 px-4 py-4 transition hover:bg-[#f9fafb] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#49715b] lg:grid-cols-[1.2fr_0.7fr_1fr_1fr_1fr_0.9fr] lg:items-center"
                    >
                      <div>
                        <div className="font-semibold">{recipient.name}</div>
                        <div className="mt-1 text-sm text-[#667085]">
                          {recipient.longTermCareNumber}
                        </div>
                      </div>
                      <div className="text-sm lg:text-base">{recipient.careGrade}</div>
                      <div className="text-sm text-[#344054]">
                        {recipient.phone ?? "미등록"}
                      </div>
                      <div className="text-sm text-[#344054]">
                        {recipient.representativeName}
                      </div>
                      <div className="text-sm text-[#344054]">
                        {recipient.representativePhone}
                      </div>
                      <div className="text-sm font-medium text-[#5f4d24]">
                        {recipient.contractExpiredDate}
                      </div>
                    </Link>
                  </li>
                ))}
            </ul>
          </div>
        </section>
      </div>
    </main>
  );
}
