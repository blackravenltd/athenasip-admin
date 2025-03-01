import { Nav } from 'react-bootstrap';

export default function Sidebar() {
  return (
	 	<div class="sidebar bg-body-secondary">
	    <Nav defaultActiveKey="/home" className="flex-column">
	      <Nav.Link href="/realms">Realms</Nav.Link>
	      <Nav.Link href="/subscribers">Subscribers</Nav.Link>
	      <Nav.Link href="/home">Calls</Nav.Link>
	    </Nav>
	 	</div>
	)
}
