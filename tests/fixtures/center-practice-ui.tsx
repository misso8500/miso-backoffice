import {createRoot} from 'react-dom/client';
import App from '../../src/App';
import '../../src/styles.css';
createRoot(document.getElementById('root')!).render(<App authUser={{id:'test',name:'테스트',email:'a@example.com'}} onSignOut={async()=>{}}/>);
