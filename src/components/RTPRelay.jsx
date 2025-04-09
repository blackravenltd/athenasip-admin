import { Table, Container, Button, Pagination, Form, InputGroup } from 'react-bootstrap';

export default function RTPRelay() {
  return (
    <>
	 		<h2>RTP Relay</h2>

      <Form>
        <Form.Check
          type="switch"
          id="custom-switch"
          label="Enable RTP Relay"
          inline={true}
        />
        <Form.Group className="mb-3" controlId="exampleForm.port-range">
          <Form.Label>Port Range</Form.Label>
           <InputGroup className="mb-3">
           <Form.Control
              placeholder="From"
              aria-label="From"
              aria-describedby="basic-addon1"
            />
            <InputGroup.Text id="basic-addon1"> - </InputGroup.Text>
            <Form.Control
              placeholder="To"
              aria-label="To"
              aria-describedby="basic-addon1"
            />
          </InputGroup>
        </Form.Group>
        <Form.Check
          type="switch"
          id="custom-switch"
          label="Queue packets until both sides connect"
          inline={true}
        />
        <Form.Group>
          <input id="custom-switch" class="form-check-input" type="checkbox" />
          <Form.Text className="text-muted">
            The RTP Relay has to receive at least one packet from both endpoints in order relay packets 
            correctly. If this is enabled, the relay will queue packets from one endpoint until the other 
            first connects, then forward them. 
          </Form.Text>
        </Form.Group>
      </Form>
    </>
	)
}
