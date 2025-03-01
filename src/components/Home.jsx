import { Table, Container, Button, Pagination } from 'react-bootstrap';

export default function Home() {


  const realms = [
    { id: 217190283123, name: 'sip.athenasip.org', description: 'The main AthenaSIP realm', subscribers: 16 },
    { id: 219812931232, name: 'blackraven.co.nz', description: 'The main AthenaSIP realm', subscribers: 5 },
  ]

  let active = 2, items = [];
  for (let number = 1; number <= 5; number++) {
    items.push(
      <Pagination.Item key={number} active={number === active}>
        {number}
      </Pagination.Item>,
    );
  }

  return (
	 	<div className="main-panel">
	 	<Container>
	 		<h2>Realms</h2>
	 		<p>Realms are the SIP domains this server is responsible for. Consider this SIP identity:</p>
	 		<div className="code">
	 			"John Smith" &lt;sip:john.smith@sip.athenasip.org&gt;
	 		</div>
	 		<p>Here, the <strong>realm</strong> is the 'domain' part of the SIP identity, <code>sip.athenasip.org</code>.</p>
	 	    <Table striped>
      <thead>
        <tr>
          <th>Realm</th>
          <th>Description</th>
          <th>Subscribers</th>
          <th><div className="float-end">Tools</div></th>
        </tr>
      </thead>
      <tbody>
        {realms.map((item)=>(
          <tr key={"realms_"+item.id}>
            <td>{item.name}</td>
            <td>{item.description}</td>
            <td>{item.subscribers}</td>
            <td>
              <Button variant="primary" size="sm" className="ms-1 float-end">Edit</Button>
              <Button variant="danger" size="sm" className="ms-1 float-end">Delete</Button>
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
    <div class="fill-h center">
    <Pagination size="sm">{items}</Pagination>
    </div>
</Container>
	 	</div>
	)
}
