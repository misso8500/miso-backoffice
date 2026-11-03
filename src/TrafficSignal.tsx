import './TrafficSignal.css';
export default function TrafficSignal({state,label}:{state:'black'|'red'|'yellow'|'green'|'idle';label:string}){
 return <span className="traffic-signal" role="img" aria-label={label} title={label}>{(['red','yellow','green'] as const).map((color,index)=><i key={color} className={state==='black'&&index===0?'lit black':state===color?`lit ${color}`:''} aria-hidden="true"/>)}</span>;
}
