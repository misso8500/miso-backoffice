export function formatPhoneNumberInput(value:string):string{
 const raw=value.replace(/\D/g,'');
 const digits=raw.slice(0,raw.startsWith('02')?10:11);
 if(/^1[568]\d{2}/.test(digits))return digits.length<=4?digits:digits.slice(0,4)+'-'+digits.slice(4,8);
 const prefix=digits.startsWith('02')?2:3;
 if(digits.length<=prefix)return digits;
 const middle=digits.startsWith('010')||digits.length===prefix+8?4:3;
 if(digits.length<=prefix+middle)return digits.slice(0,prefix)+'-'+digits.slice(prefix);
 return digits.slice(0,prefix)+'-'+digits.slice(prefix,prefix+middle)+'-'+digits.slice(prefix+middle);
}
export function phoneInputChange(previous:string,raw:string,position:number,inputType:string){
 let digits=raw.replace(/\D/g,''),before=raw.slice(0,position).replace(/\D/g,'').length;
 if(inputType.startsWith('delete')&&digits===previous.replace(/\D/g,'')&&raw.length<previous.length){
  const at=inputType==='deleteContentBackward'?before-1:before;
  if(at>=0&&at<digits.length){digits=digits.slice(0,at)+digits.slice(at+1);if(inputType==='deleteContentBackward')before--;}
 }
 const value=formatPhoneNumberInput(digits);let caret=0,count=0;
 while(caret<value.length&&count<before){if(/\d/.test(value[caret]))count++;caret++;}
 if(value[caret]==='-')caret++;
 return {value,caret};
}
