#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const modelPath = path.join(root, 'htdocs/luci-static/resources/timecontrol-native/model.js');
const source = fs.readFileSync(modelPath, 'utf8');
assert(source.includes("'require baseclass';"));
const baseclass = { extend: object => object };
const model = new Function('baseclass', source)(baseclass);

assert.strictEqual(model.managedName('iPad'), 'TimeControl: iPad');
assert.strictEqual(model.managedName('TimeControl: iPad'), 'TimeControl: iPad');
assert.strictEqual(model.isManaged('TimeControl: iPad'), true);
assert.strictEqual(model.isManaged('Allow-DHCP-Renew'), false);
assert.strictEqual(model.displayName('TimeControl: iPad'), 'iPad');
assert.strictEqual(model.isValidTimeRange('08:00:00', '22:00:00'), true);
assert.strictEqual(model.isValidTimeRange('08:00:00', '08:00:00'), false);
const hosts = {
    '02:00:00:00:00:10': { name: 'Tablet', ipaddrs: [ '192.0.2.10', '192.0.2.11' ] },
    '02:00:00:00:00:20': { ipaddrs: [ '192.0.2.20' ] }
};
assert.deepStrictEqual(model.deviceForMac(hosts, '02:00:00:00:00:10'), {
    mac: '02:00:00:00:00:10', name: 'Tablet', ipaddrs: [ '192.0.2.10', '192.0.2.11' ]
});
assert.deepStrictEqual(model.deviceForMac(hosts, '02:00:00:00:00:20'), {
    mac: '02:00:00:00:00:20', name: '', ipaddrs: [ '192.0.2.20' ]
});
assert.strictEqual(model.deviceForMac(hosts, '02:00:00:00:00:99'), null);
assert.strictEqual(model.bindingName(model.deviceForMac(hosts, '02:00:00:00:00:10'), '02:00:00:00:00:10', 'TimeControl: Old'), 'Tablet');
assert.strictEqual(model.bindingName(model.deviceForMac(hosts, '02:00:00:00:00:20'), '02:00:00:00:00:20', 'TimeControl: Console'), 'Console');
assert.strictEqual(model.bindingName(model.deviceForMac(hosts, '02:00:00:00:00:20'), '02:00:00:00:00:99', ''), '192.0.2.20');
const labels = {
    allDay: '全天',
    everyday: '每天',
    weekdays: '工作日',
    weekend: '周末',
    overnight: '次日'
};

assert.strictEqual(model.weekdaySummary('', labels), '每天');
assert.strictEqual(model.weekdaySummary('Mon Tue Wed Thu Fri Sat Sun', labels), '每天');
assert.strictEqual(model.weekdaySummary('Mon Tue Wed Thu Fri', labels), '工作日');
assert.strictEqual(model.scheduleSummary('22:00:00', '07:00:00', '', labels), '22:00 → 次日 07:00 · 每天');
assert.strictEqual(model.scheduleSummary('08:00:00', '22:00:00', 'Mon Tue Wed Thu Fri', labels), '08:00 → 22:00 · 工作日');
assert.strictEqual(model.scheduleSummary('', '', '', labels), '全天 · 每天');

const zoneHosts = {
    '02:00:00:00:01:10': { name: 'LAN tablet', ipaddrs: [ '192.0.2.10', '198.51.100.10' ] },
    '02:00:00:00:01:20': { name: 'Docker host', ipaddrs: [ '203.0.113.2' ] },
    '02:00:00:00:01:30': { name: '', ipaddrs: [] }
};
const zoneSections = [
    { name: 'lan', network: [ 'lan' ] },
    { name: 'docker', network: [ 'docker' ] }
];
const runtimeInterfaces = [
    { interface: 'lan', 'ipv4-address': [ { address: '192.0.2.1', mask: 24 } ] },
    { interface: 'docker', 'ipv4-address': [ { address: '203.0.113.1', mask: 24 } ] }
];
assert.deepStrictEqual(model.hostsForZone(zoneHosts, zoneSections, runtimeInterfaces, 'lan'), {
    '02:00:00:00:01:10': { name: 'LAN tablet', ipaddrs: [ '192.0.2.10' ] }
});
assert.deepStrictEqual(model.hostsForZone(zoneHosts, zoneSections, runtimeInterfaces, 'docker'), {
    '02:00:00:00:01:20': { name: 'Docker host', ipaddrs: [ '203.0.113.2' ] }
});
assert.deepStrictEqual(model.hostsForZone(zoneHosts, zoneSections, runtimeInterfaces, 'missing'), {});

console.log('model tests: PASS');
