import {createRoot} from 'react-dom/client';
import App from '../../src/App';
import '../../src/styles.css';
createRoot(document.getElementById('root')!).render(<App authUser={{id:'google-a',email:'a@example.com',name:'테스트 직원'}} onSignOut={async()=>{}}/>);
