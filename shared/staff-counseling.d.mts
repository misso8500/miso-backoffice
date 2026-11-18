export type CounselingEmployeeContract={id:string;name:string;birthDate:string;jobTitle:string;contractStartDate:string;contractEndDate:string;enabled:boolean;isDraft:boolean};
export type CounselingWorker={id:string;name:string;birthDate:string;contracts:CounselingEmployeeContract[]};
export const counselingServiceTypes:Record<'visitCare'|'visitBath',string>;
export const counselingMethods:Record<'faceToFace'|'phone',string>;
export function counselingQuarter(date:string):number;
export function counselingContractForDate(worker:CounselingWorker,date:string):CounselingEmployeeContract;
