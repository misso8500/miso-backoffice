import {createRoot} from 'react-dom/client';
import WorkHub from '../../src/WorkHub';
import '../../src/styles.css';
import '../../src/dev-workspace.css';
createRoot(document.getElementById('root')!).render(<div className="sidebar-preview" style={{padding:20}}><WorkHub onDirectoryChanged={()=>{}}/></div>);
