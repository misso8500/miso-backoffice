export const recipientGridColumns = ["name", "birthDate", "longTermCareNumber", "careGrade", "phone", "address"] as const;

export const parseSpreadsheetPaste = (text: string): string[][] => {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"' && (quoted || !cell)) {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && char === "\t") { row.push(cell); cell = ""; }
    else if (!quoted && (char === "\r" || char === "\n")) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("붙여넣은 셀의 따옴표를 확인해 주세요.");
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
};

export const normalizeGridBirthDate = (value: string) => {
  const trimmed = value.trim();
  if (/^\d{8}$/.test(trimmed)) return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6)}`;
  const match = trimmed.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
  return match ? `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : trimmed;
};
