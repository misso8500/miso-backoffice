export type RecipientBasicInfoValues={name:string;birthDate:string;longTermCareNumber:string;careGrade:string;phone:string;address:string;representativeName:string;representativeRelation:string;representativePhone:string;operationalName:string;assignedBackofficeUserId:string;serviceStartDate:string;serviceEndDate:string;serviceType:string;reductionType:string;relatedPeople:string};
export const basicInfoFields:Record<keyof RecipientBasicInfoValues,number>;
export const registrationFields:{key:keyof RecipientBasicInfoValues;label:string}[];
export function basicInfoDraft(person:Partial<RecipientBasicInfoValues>):RecipientBasicInfoValues;
export function validBasicDate(value:string):boolean;
export function registrationIssues(value:RecipientBasicInfoValues):{key:keyof RecipientBasicInfoValues;label:string;message:string}[];
