import { LoadingScreen } from './loading';
import { fitStage } from './viewport';

// Keep the first paint independent from the engine download.
fitStage();
import('./main').catch(()=>LoadingScreen.fail());
