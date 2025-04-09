import { AppStateProvider, HistoryNavigator, initAppState } from "./components"
import Main from "./Main"

initAppState({
  route: '/',
});

function App() {
  return (
    <AppStateProvider>
      <HistoryNavigator>
        <Main />
      </HistoryNavigator>
    </AppStateProvider>
  );
}

export default App;
