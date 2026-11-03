import TrafficSignal from './TrafficSignal';
import {recipientServiceSignal} from '../shared/recipient-directory.mjs';
import type {Recipient} from './types';
export default function RecipientServiceSignal({recipient,status}:{recipient:Recipient;status:string}){
 const signal=recipientServiceSignal(recipient,status);
 return <span className="recipient-service-signal"><TrafficSignal state={signal.state} label={`${recipient.name} 서비스 상태: ${signal.label}`}/><span>{signal.label}</span></span>;
}
