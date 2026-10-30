export type WorkQueryCache = {
 get<T>(key:string,loader:()=>Promise<T>,options?:{force?:boolean}):Promise<T>;
 peek<T>(key:string):T|undefined;
 subscribe(key:string,listener:()=>void):()=>void;
 update(predicate:(key:string)=>boolean,transform:(value:any,key:string)=>any):void;
 invalidate(predicate:(key:string)=>boolean):void;
 revalidate():Promise<void>;
 clear():void;
};
export function createWorkQueryCache(options?:{ttl?:number;now?:()=>number;limit?:number}):WorkQueryCache;
