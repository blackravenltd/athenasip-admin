import { Container, Navbar, Nav, NavDropdown, Row, Col } from 'react-bootstrap';
import { Navigation, Sidebar, Home } from './components'

export default function Main() {
  return (
		<>
			<Navigation />
			<div class="main-view">
				<Sidebar />
				<Home />
			</div>
		</>
	)
}