import { AppStateProvider, initAppState } from "./components"
import { useAppState } from  "./hooks"

import Main from "./Main"

initAppState({

});

function App() {
  return (
    <AppStateProvider>
    <Main />
    </AppStateProvider>
  );
}

export default App;
