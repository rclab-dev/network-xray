// Data for the CCNA lecture example — shows OSPF adjacency formation between 2 routers (R1—R2) in 7 states.
// Rendered with the real engine (xray-core.js) + xrayCore (xray-api.js). Each state is switched via applyState.
// Note: this is teaching material about "adjacency formation", so ping/traffic is not used (the ping orb is hidden by the demo CSS).

window.CCNA_CONFIG = {
  success: true, id: 'ccna', topology_type: 'linear', layout: '',
  nodes: [
    { id: 'r1', role: 'Router', type: 'router', target: true },
    { id: 'r2', role: 'Router', type: 'router' }
  ],
  networks: [
    { name: 'net-r1r2', members: [{ node: 'r1', host_id: 1 }, { node: 'r2', host_id: 2 }] }
  ],
  xray: {
    protocol: 'ospf', pattern: 'ospf_linear', ping_mode: 'from-r1',
    holo_fields: [
      { label: 'Neighbor', field: 'neighbor_state', ok: 'Full', err: '—' },
      { label: 'LSDB', field: 'has_full', ok: 'Synced', err: 'syncing' }
    ]
  }
};

// Build one state. nbr = OSPF FSM state name, opts.peerHello = whether the peer is sending Hello,
// opts.ifUp = whether the IF is up. target=r1, peer=r2, single IF eth0 (R1—R2 link).
function _ccna(nbr, opts) {
  opts = opts || {};
  var ifUp = opts.ifUp !== false;
  var ospfOn = ifUp;                       // r1 has OSPF enabled (sends Hello while the IF is up)
  var peerHello = !!opts.peerHello && ifUp; // whether r2 is sending Hello
  var full = (nbr === 'Full') && ifUp;
  var state = ifUp ? nbr : 'Down';
  return {
    success: true, scenario: 'ccna', target_node: 'r1', peer_id: 'r2', peer_node: 'r2',
    interfaces: { eth0: { up: ifUp, ip: '10.0.12.1/24' } },
    wan_iface: 'eth0', lan_iface: 'eth0',
    ospf_configured: true,
    ospf_active_on_interface: ospfOn,       // helloOut (r1 sends Hello)
    peer_sending_hello: peerHello,          // helloIn (r2's Hello received)
    neighbor_state: state,
    has_full: full, full_count: full ? 1 : 0,
    has_ospf_route: full, ping_ok: false, cleared: false,
    iface_hellos: ospfOn ? { eth0: 10 } : {},  // own-IF Hello (outbound orb)
    peer_hellos: { r2: 10 },                    // peer Hello (inbound orb)
    r1_hello: 10, r2_hello: 10, target_hello: 10, peer_hello: 10,
    r1_dead: 40, r2_dead: 40, target_dead: 40, peer_dead: 40,
    target_area: '0.0.0.0', peer_area: '0.0.0.0', r1_area: '0.0.0.0', r2_area: '0.0.0.0',
    timer_match: true, area_match: true,
    // Only at Full is r2's loopback 2.2.2.2/32 learned via OSPF →
    // appears in the Routing Engine panel ("Route: OSPF 2.2.2.2/32 / FORWARD") + LSDB row + cylinder FORWARD arrow.
    // Below Full, target=2.2.2.2 is looked up but resolved:false → panel shows "Route to 2.2.2.2: NONE".
    route_resolution: full
      ? { target: '2.2.2.2', resolved: true, protocol: 'ospf', out_iface: 'eth0', next_hop: '10.0.12.2', matched_prefix: '2.2.2.2/32' }
      : { target: '2.2.2.2', resolved: false, protocol: '', out_iface: '', next_hop: '', matched_prefix: '' },
    is_passive: false
  };
}

window.CCNA_STATES = {
  down:     _ccna('Down',     { peerHello: false }), // sending Hello only, peer not yet responding
  init:     _ccna('Init',     { peerHello: true  }), // peer Hello received (one-way)
  twoway:   _ccna('2-Way',    { peerHello: true  }), // bidirectional Hello established (DR/BDR election)
  exstart:  _ccna('ExStart',  { peerHello: true  }), // Master/Slave decided, DBD exchange begins
  exchange: _ccna('Exchange', { peerHello: true  }), // DBD exchange in progress → LSDB gather animation
  loading:  _ccna('Loading',  { peerHello: true  }), // request/retrieve missing LSAs → LSDB gather
  full:     _ccna('Full',     { peerHello: true  }), // fully synced → tunnel + LSDB green
  linkdown: _ccna('Down',     { ifUp: false, peerHello: false }) // link down → ✖, Hello stops
};

window.CCNA_DESC = {
  down:     'Down — sending Hello, but no Hello has been received from the peer yet.',
  init:     'Init — peer Hello received (one-way). We do not yet appear in the peer\'s neighbor list.',
  twoway:   '2-Way — bidirectional Hello established. DR/BDR are elected here.',
  exstart:  'ExStart — Master/Slave is decided and DBD (DB Description) exchange begins.',
  exchange: 'Exchange — exchanging LSDB summaries via DBD. → the LSA gather animation plays inside the cylinder.',
  loading:  'Loading — requesting/retrieving missing LSAs via LSR/LSU. → LSA gather continues.',
  full:     'Full — LSDB fully synced, adjacency established. r2\'s loopback 2.2.2.2/32 is learned via OSPF → shown in the Routing Engine panel, LSDB, and the cylinder FORWARD arrow. Tunnel shown, gauge green, gather stops.',
  linkdown: 'Link Down — link down. Hello stops and the adjacency goes down (✖).'
};
