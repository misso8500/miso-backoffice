import type { InputHTMLAttributes } from 'react';
import { limitDateYearToFourDigits } from './lib/date-input';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'min' | 'max'> & {
  value: string; onChange: (event: { target: { value: string } }) => void; min?: string; max?: string;
};
export default function DateInput({ value, onChange, min, max, ...props }: Props) {
  return <input {...props} type="date" min={min || '1000-01-01'} max={max || '9999-12-31'} value={limitDateYearToFourDigits(value)}
    onChange={event => {
      const next = limitDateYearToFourDigits(event.currentTarget.value);
      if (next !== event.currentTarget.value) event.currentTarget.value = next;
      onChange({ target: { value: next } });
    }} />;
}
