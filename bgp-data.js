// BGP example data — shows eBGP session establishment between 2 routers (R1 AS65001 — R2 AS65002).
// Rendered by the real engine (xray-core.js) + xrayCore (xray-api.js). Each state is switched via applyState.
// Note: the observed router (the cylinder you open) is r2. peer = r1 (left). r1 advertises 203.0.113.0/24 → r2 learns it.
//       This is a teaching example with no ping/traffic, so the ping orb is hidden via the demo CSS.
//
//The engine's BGP rendering is binary — "Established or not" (there is no per-step FSM rendering like OSPF).
//   The cylinder draws session-down → Established + route learning, and the intermediate BGP FSM stages are
//   supplemented by the 3-step indicator (the same approach used to show Init/2-Way in the OSPF example).

window.BGP_CONFIG = {
  success: true, id: 'bgp', topology_type: 'linear', layout: '',
  nodes: [
    { id: 'r1', role: 'AS 65001', type: 'router' },
    { id: 'r2', role: 'AS 65002', type: 'router', target: true }   // observed router = r2
  ],
  networks: [
    { name: 'net-r1r2', members: [{ node: 'r1', host_id: 1 }, { node: 'r2', host_id: 2 }] }
  ],
  xray: {
    protocol: 'bgp', pattern: 'bgp_linear', ping_mode: 'cylinder-to-left',  // peer r1 is on the left
    holo_fields: [
      { label: 'BGP Session', field: 'is_established', ok: 'Established', fallback: 'bgp_state' },
      { label: 'Prefix 203.0.113.0/24', field: 'pfx_rcvd', ok: 'received', err: '—' }
    ]
  }
};

// Build one state. fsm = BGP FSM state name, opts.ifUp = whether the r2-r1 link is up.
// Observed router r2 / peer r1 / single IF eth0 (R1—R2 link, r2 side 10.0.12.2).
function _bgp(fsm, opts) {
  opts = opts || {};
  var ifUp = opts.ifUp !== false;
  var est = (fsm === 'Established') && ifUp;
  var bstate = ifUp ? fsm : 'Active';   // link down → TCP :179 cannot be established, falls back to Active (retrying)
  return {
    success: true, scenario: 'bgp', target_node: 'r2', peer_id: 'r1', peer_node: 'r1',
    interfaces: { eth0: { up: ifUp, ip: '10.0.12.2/24' } },
    wan_iface: 'eth0', lan_iface: 'eth0',
    bgp_configured: true,                 // router bgp is configured (FSM advances) → BGP processor core lit
    is_established: est,                   //primary truth value: Established or not (drives tunnel display)
    bgp_state: bstate,                     // FSM string for display (fallback)
    r1_established: est,                   // per-peer (peer = r1)
    pfx_rcvd: est ? 1 : 0,                 // number of received prefixes
    // BGP does not use OSPF's hello/LSDB → OSPF-family fields are disabled (no hello orb emitted)
    neighbor_state: 'None', has_full: false, ospf_configured: false, ospf_active_on_interface: false,
    iface_hellos: {}, peer_hellos: {}, peer_sending_hello: false,
    // Only at Established does r2 learn the 203.0.113.0/24 advertised by the peer (r1 / AS65001) →
    // Routing Engine panel "Route: BGP 203.0.113.0/24 / FORWARD" + cylinder FORWARD arrow + tunnel (purple).
    route_resolution: est
      ? { target: '203.0.113.0', resolved: true, protocol: 'bgp', out_iface: 'eth0', next_hop: '10.0.12.1', matched_prefix: '203.0.113.0/24' }
      : { target: '203.0.113.0', resolved: false, protocol: '', out_iface: '', next_hop: '', matched_prefix: '' },
    ping_ok: false, cleared: false, is_passive: false
  };
}

window.BGP_STATES = {
  idle:        _bgp('Idle'),        // BGP configured but TCP not yet started
  connect:     _bgp('Connect'),     // attempting connection to the peer's TCP :179
  opensent:    _bgp('OpenSent'),    // TCP established → OPEN sent, awaiting peer's OPEN
  openconfirm: _bgp('OpenConfirm'), // peer OPEN received → awaiting first KEEPALIVE
  established: _bgp('Established'),  // session established → routes learned via UPDATE, tunnel purple
  linkdown:    _bgp('Active', { ifUp: false })  // link down → Active (retrying), ✖
};

window.BGP_DESC = {
  idle:        'Idle — BGP is configured but the TCP connection has not yet been initiated (initial state).',
  connect:     'Connect — attempting to connect to the peer\'s TCP :179 (waiting on the 3-way handshake).',
  opensent:    'OpenSent — TCP established. OPEN (AS number, hold time, capabilities) sent; waiting for the peer\'s OPEN.',
  openconfirm: 'OpenConfirm — peer\'s OPEN received. Waiting for the first KEEPALIVE.',
  established: 'Established — session up. KEEPALIVE/UPDATE flow, and the 203.0.113.0/24 advertised by the peer (AS 65001) is learned → shown in the Routing Engine panel, cylinder FORWARD arrow, and tunnel (purple).',
  linkdown:    'Link Down — with the link down, TCP :179 cannot be established and the session falls back to Active (retrying) (✖).'
};
