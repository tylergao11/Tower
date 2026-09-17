import { LoadingScreen } from './loading';

// Keep the first paint independent from the engine download.
import('./main').catch(()=>LoadingScreen.fail());
