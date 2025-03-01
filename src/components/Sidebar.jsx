import { Container, Navbar, Nav, NavDropdown, Row, Col } from 'react-bootstrap';
import { Navigation } from './'

export default function Sidebar() {
  return (
	 	<div class="sidebar bg-body-secondary">
	    <Nav defaultActiveKey="/home" className="flex-column">
	      <Nav.Link href="/home/">Active</Nav.Link>
	      <Nav.Link eventKey="/home/">Link</Nav.Link>
	      <Nav.Link eventKey="link-2">Link</Nav.Link>
	      <Nav.Link eventKey="disabled" disabled>Disabled</Nav.Link>
	    </Nav>
	 	</div>
	)
}