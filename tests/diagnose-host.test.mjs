import assert from 'node:assert/strict';
import test from 'node:test';
import { physicalAddresses, privateIPv4 } from '../scripts/diagnose-host.mjs';
test('diagnostics accepts only private IPv4 targets without shell syntax', () => {
  for (const ip of ['10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.31.196']) assert.equal(privateIPv4(ip), true);
  for (const ip of ['8.8.8.8', '127.0.0.1', '169.254.1.1', '172.32.0.1', '192.168.999.1', '192.168.1.1;reboot', 'localhost', undefined]) assert.equal(privateIPv4(ip), false);
});
test('diagnostics excludes public addresses, MACs, Docker and tunnels', () => {
  assert.deepEqual(physicalAddresses([
    { ifname: 'wlan0', operstate: 'UP', address: 'private-mac', addr_info: [{ family: 'inet', local: '192.168.31.20' }, { family: 'inet', local: '203.0.113.10' }, { family: 'inet6', local: 'fd00::1' }] },
    { ifname: 'docker0', addr_info: [{ family: 'inet', local: '172.17.0.1' }] },
    { ifname: 'tailscale0', addr_info: [{ family: 'inet', local: '100.64.0.1' }] },
  ]), [{ interface: 'wlan0', state: 'UP', ipv4: ['192.168.31.20'] }]);
});
