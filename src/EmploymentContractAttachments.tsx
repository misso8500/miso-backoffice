import DriveTestImages from "./DriveTestImages";
import DocumentImages from "./DocumentImages";

export default function EmploymentContractAttachments() {
  return <section className="contract-attachments" aria-label="근로자 서류 미리보기">
    <h3>근로자 서류</h3>
    <DriveTestImages />
    <p className="contract-attachment-note">선택한 근로계약의 계약서와 근로자 공통 서류를 구분하여 확인합니다. 현재는 저장 전 미리보기이며, 공통 서류도 다른 계약에 자동으로 연결되지 않습니다.</p>
    <h4 className="document-group-heading">선택한 계약의 서류</h4>
    <DocumentImages title="근로계약서" expectedPages={3} />
    <h4 className="document-group-heading">근로자 공통 서류</h4>
    <DocumentImages title="범죄경력 회보서" expectedPages={3} />
    <DocumentImages title="요양보호사 자격증" />
    <DocumentImages title="건강검진 확인서 (채용검진 확인서)" />
  </section>;
}
