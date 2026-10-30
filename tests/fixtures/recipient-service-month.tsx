import {createRoot} from 'react-dom/client';
import RecipientServiceMonth from '../../src/RecipientServiceMonth';
import '../../src/styles.css';
createRoot(document.getElementById('root')!).render(<RecipientServiceMonth onDirty={()=>{}} onBusy={()=>{}}/>);
