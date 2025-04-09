import { Nav } from 'react-bootstrap';

export default function SIPSidebar() {
  return (
	 	<div className="sidebar bg-body-secondary position-fixed h-100">
	    <Nav defaultActiveKey="/home" className="flex-column">
	      <Nav.Link href="/sip"><strong>SIP</strong></Nav.Link>
	      <Nav.Link href="/sip/realms">Realms</Nav.Link>
	      <Nav.Link href="/sip/subscribers">Subscribers</Nav.Link>
	      <Nav.Link href="/sip/calls">Calls</Nav.Link>
	    </Nav>
	 	</div>
	)
}
