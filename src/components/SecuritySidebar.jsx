import { Nav } from 'react-bootstrap';

export default function SecuritySidebar() {
  return (
	 	<div className="sidebar bg-body-secondary position-fixed h-100">
	    <Nav defaultActiveKey="/home" className="flex-column">
	      <Nav.Link href="/security"><strong>Security</strong></Nav.Link>
	      <Nav.Link href="/security/encryption">Encryption</Nav.Link>
	      <Nav.Link href="/security/users">Users</Nav.Link>
	    </Nav>
	 	</div>
	)
}
