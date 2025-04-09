import { Container } from 'react-bootstrap';
import { Navigation, SIPSidebar, SecuritySidebar, MediaSidebar, Home, Realms, Settings, Media, RTPRelay, Security, Calls } from './components'
import Calls2 from './components/Calls2.jsx' 
import { useAppState } from  "./hooks"


export default function Main() {
	const [ appState ] = useAppState();

	const routes = {
		'/sip/realms': [ <SIPSidebar />, <Realms /> ],
		'/sip/subscribers': [ <SIPSidebar />, <Realms /> ],
		'/sip/calls': [ <SIPSidebar />, <Calls /> ],
		'/sip/calls2': [ <SIPSidebar />, <Calls2 /> ],
		'/sip/forwarding': [ <SIPSidebar />, <Realms /> ],
		'/media': [ <MediaSidebar />, <Media /> ],
		'/media/rtprelay': [ <MediaSidebar />, <RTPRelay /> ],
		'/settings': [ <SIPSidebar />, <Settings /> ],
		'/security': [ <SecuritySidebar />, <Security /> ],
		'/security/encryption': [ <SecuritySidebar />, <Security /> ],
		'/security/users': [ <SecuritySidebar />, <Security /> ],
	}

  return (
		<>
			<Navigation />
			<div className="main-view">
				{(routes[appState.route] && routes[appState.route][0]) || <SIPSidebar />}
				<div className="main-panel">
					<Container>
						{(routes[appState.route] && routes[appState.route][1]) ||  <Home />}
					</Container>
				</div>
			</div>
		</>
	)
}