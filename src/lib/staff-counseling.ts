import type {CounselingWorker} from '../../shared/staff-counseling.mjs';
import {recurrenceToday} from '../../shared/work-recurrence.mjs';
export type Subject={contractId:string;name:string;birthDate:string;jobTitle:string;contractStartDate:string;contractEndDate:string};
export type CounselingDraft={employeeContractId:string;subject:Subject|null;date:string;startTime:string;endTime:string;serviceTypes:('visitCare'|'visitBath')[];method:''|'faceToFace'|'phone';counselorId:string;counselorName:string;counselorRole:string;actionDate:string;content:string;actionNeeded:''|'yes'|'no';actionContent:string;socialWorkerReviewer:string;directorReviewer:string};
export type CounselingRecord=CounselingDraft&{id:string;subject:Subject;version:number;archived:boolean;createdAt:string;updatedAt:string};
export type CounselingSummary=Pick<CounselingRecord,'id'|'employeeContractId'|'subject'|'date'|'startTime'|'endTime'|'counselorName'|'serviceTypes'|'actionNeeded'|'actionDate'|'archived'|'version'|'updatedAt'>&{quarter:number;hasContent:boolean};
export type CounselingDetail={record:CounselingRecord;history:{id:string;version:number;kind:string;actorName:string;createdAt:string}[]};
export type CounselingContext={workers:CounselingWorker[];counselors:{id:string;name:string}[];me:{id:string;name:string}};
export const emptyCounseling=(context:CounselingContext):CounselingDraft=>({employeeContractId:'',subject:null,date:recurrenceToday(),startTime:'',endTime:'',serviceTypes:[],method:'',counselorId:'',counselorName:context.me.name,counselorRole:'',actionDate:'',content:'',actionNeeded:'',actionContent:'',socialWorkerReviewer:'',directorReviewer:''});
export function counselingDraft(record:CounselingRecord):CounselingDraft{
 return {employeeContractId:record.employeeContractId,subject:record.subject,date:record.date,startTime:record.startTime,endTime:record.endTime,serviceTypes:record.serviceTypes,method:record.method,counselorId:record.counselorId,counselorName:record.counselorName,counselorRole:record.counselorRole,actionDate:record.actionDate,content:record.content,actionNeeded:record.actionNeeded,actionContent:record.actionContent,socialWorkerReviewer:record.socialWorkerReviewer,directorReviewer:record.directorReviewer};
}
