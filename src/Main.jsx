import { Container } from 'react-bootstrap';
import { Navigation, Sidebar, Home, Realms } from './components'
import { useAppState } from  "./hooks"

const routes = {
	'/realms': <Realms />,
}

export default function Main() {
	const [ appState ] = useAppState();
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