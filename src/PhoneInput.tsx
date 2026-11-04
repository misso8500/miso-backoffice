import {useLayoutEffect,useRef,type InputHTMLAttributes} from 'react';
import {formatPhoneNumberInput,phoneInputChange} from './lib/phone-input';
type Props=Omit<InputHTMLAttributes<HTMLInputElement>,'type'|'value'|'onChange'> & {value:string;onChange:(event:{target:{value:string}})=>void};
export default function PhoneInput({value,onChange,...props}:Props){
 const input=useRef<HTMLInputElement>(null),pending=useRef<number|null>(null);
 useLayoutEffect(()=>{if(pending.current!==null){input.current?.setSelectionRange(pending.current,pending.current);pending.current=null;}});
 return <input {...props} ref={input} type="tel" inputMode="tel" autoComplete={props.autoComplete??'tel'} placeholder={props.placeholder??'010-0000-1111'} value={formatPhoneNumberInput(value)} onChange={event=>{
  const node=event.currentTarget,next=phoneInputChange(formatPhoneNumberInput(value),node.value,node.selectionStart??node.value.length,(event.nativeEvent as InputEvent).inputType||'');
  pending.current=next.caret;node.value=next.value;node.setSelectionRange(next.caret,next.caret);onChange({target:{value:next.value}});
 }}/>;
}
