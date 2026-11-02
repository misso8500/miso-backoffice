import {createRoot} from 'react-dom/client';
import WorkOperationStatus from '../../src/WorkOperationStatus';
import '../../src/WorkHub.css';
import StaffRecordCalendar from '../../src/StaffRecordCalendar';
import '../../src/styles.css';
import '../../src/StaffRecords.css';
const noop=()=>{};
createRoot(document.getElementById('root')!).render(<section className="staff-records"><WorkOperationStatus/><StaffRecordCalendar profile={{staffId:'staff-test',name:'테스트 직원',organization:'테스트 기관',jobTitle:'사회복지사',startTime:'09:00',endTime:'18:00',hours:8,version:1}} onDirty={noop} onBusy={noop}/></section>);
