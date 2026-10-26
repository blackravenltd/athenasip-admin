import { describe, expect, it } from 'vitest';
import type { ClientConfig } from '../api/types';
import { lineSettings } from './line';

const CLUSTER: ClientConfig = {
  websocket_uri: 'wss://a.example:8089',
  websocket_uris: ['wss://a.example:8089', 'wss://b.example:8089'],
  transports: [{ transport: 'ws', address: '10.0.0.1', port: 8088, uri: 'sip:10.0.0.1:8088;transport=ws' }],
  nodes: [
    { id: 'a', self: true, transports: [{ transport: 'ws', address: '10.0.0.1', port: 8088, uri: '' }] },
    { id: 'b', self: false, transports: [{ transport: 'ws', address: '10.0.0.2', port: 8088, uri: '' }] },
  ],
  ice_servers: [],
  realm: { name: 'example.com', registration: { expires: 3600, minimum: 60 }, outbound: { flows: 2 }, push: [], conferences: [] },
};

describe('lineSettings', () => {
  it('keeps a flow to each of two nodes for the lifetime the realm grants, over wss on https', () => {
    expect(lineSettings(CLUSTER, true)).toEqual({
      socket: 'wss://a.example:8089', fallbacks: ['wss://b.example:8089'], expires: 3600, flows: 2,
    });
  });

  it('uses each node’s ws listener on an http page', () => {
    expect(lineSettings(CLUSTER, false)).toMatchObject({ socket: 'ws://10.0.0.1:8088', fallbacks: ['ws://10.0.0.2:8088'], flows: 2 });
  });

  it('starts from a typed WebSocket of the cluster’s, failing over to the rest', () => {
    expect(lineSettings(CLUSTER, true, 'wss://b.example:8089')).toMatchObject({ socket: 'wss://b.example:8089', fallbacks: ['wss://a.example:8089'], flows: 2 });
  });

  it('keeps one flow and no failover for a typed WebSocket that is not the cluster’s', () => {
    expect(lineSettings(CLUSTER, true, 'wss://elsewhere:443')).toEqual({ socket: 'wss://elsewhere:443', fallbacks: [], expires: 3600, flows: 1 });
  });

  it('keeps one flow on a single node, whatever the realm wants', () => {
    const single: ClientConfig = { ...CLUSTER, websocket_uris: ['wss://a.example:8089'], nodes: [CLUSTER.nodes![0]] };
    expect(lineSettings(single, true)).toMatchObject({ fallbacks: [], flows: 1 });
  });

  it('says there is no socket when the node offers none this page can use', () => {
    expect(lineSettings({ transports: [], ice_servers: [] }, true).socket).toBeUndefined();
  });
});
