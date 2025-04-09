import { Nav } from 'react-bootstrap';

export default function MediaSidebar() {
  return (
	 	<div className="sidebar bg-body-secondary position-fixed h-100">
	    <Nav defaultActiveKey="/home" className="flex-column">
	      <Nav.Link href="/media"><strong>Media</strong></Nav.Link>
	      <Nav.Link href="/media/rtprelay">RTP Relay</Nav.Link>
	    </Nav>
	 	</div>
	)
}
