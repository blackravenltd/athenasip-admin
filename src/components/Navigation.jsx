import { Container, Navbar, Nav, NavDropdown } from 'react-bootstrap';
import { ReactComponent as AthenaLogo } from '../assets/athenasip_small_white.svg'

export default function Navigation() {
  return (
    <Navbar expand="lg" fixed="top" className="bg-body-tertiary" data-bs-theme="dark">
      <Container>
        <Navbar.Brand href="/"><AthenaLogo className="small-logo"/> AthenaSIP</Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            <Nav.Link href="/sip">SIP</Nav.Link>
            <Nav.Link href="/media">Media Relay</Nav.Link>
            <Nav.Link href="/security">Security</Nav.Link>
            <NavDropdown title="Settings" id="basic-nav-dropdown">
              <NavDropdown.Item href="terminate">
              	Terminate All Calls
              </NavDropdown.Item>
              <NavDropdown.Item href="restart">
              	Restart Server
              </NavDropdown.Item>
              <NavDropdown.Divider />
              <NavDropdown.Item href="logout">
                Log Out
              </NavDropdown.Item>
            </NavDropdown>
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
	)
}
