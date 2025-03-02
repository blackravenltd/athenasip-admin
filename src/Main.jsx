import { Container } from 'react-bootstrap';
import { Navigation, Sidebar, Home, Realms, Settings, Media, Security } from './components'
import { useAppState } from  "./hooks"


export default function Main() {
	const [ appState ] = useAppState();

	const routes = {
		'/realms': <Realms />,
		'/settings': <Settings />,
		'/security': <Security />,
		'/media': <Media />,
	}

  return (
		<>
			<Navigation />
			<div className="main-view">
				<Sidebar />
				<div className="main-panel">
					<Container>
						{routes[appState.route] || <Home />}
					</Container>
				</div>
			</div>
		</>
	)
}