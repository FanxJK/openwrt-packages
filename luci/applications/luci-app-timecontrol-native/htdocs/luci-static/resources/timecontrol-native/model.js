'use strict';
'require baseclass';

var PREFIX = 'TimeControl: ';
var DAY_ORDER = [ 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun' ];

function normalizedDays(value) {
	var input = String(value || '').trim().split(/\s+/).filter(Boolean);
	return DAY_ORDER.filter(function(day) { return input.indexOf(day) !== -1; });
}

function shortTime(value) {
	return String(value || '00:00').substring(0, 5);
}

function toArray(value) {
	return Array.isArray(value) ? value : (value ? [ value ] : []);
}

function ipv4Number(value) {
	var parts = String(value || '').split('.');
	if (parts.length !== 4 || parts.some(function(part) {
		return !/^\d+$/.test(part) || Number(part) > 255;
	}))
		return null;
	return parts.reduce(function(result, part) {
		return ((result << 8) | Number(part)) >>> 0;
	}, 0);
}

function inSubnet(address, network, prefix) {
	var ip = ipv4Number(address);
	var base = ipv4Number(network);
	prefix = Number(prefix);
	if (ip === null || base === null || prefix < 0 || prefix > 32)
		return false;
	var mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
	return (ip & mask) === (base & mask);
}

return baseclass.extend({
	prefix: PREFIX,

	managedName: function(name) {
		name = String(name || '').trim();
		return name.indexOf(PREFIX) === 0 ? name : PREFIX + name;
	},

	isManaged: function(name) {
		return String(name || '').indexOf(PREFIX) === 0;
	},

	displayName: function(name) {
		name = String(name || '');
		return name.indexOf(PREFIX) === 0 ? name.substring(PREFIX.length) : name;
	},

	isValidTimeRange: function(start, stop) {
		return Boolean(start && stop && start !== stop);
	},

	deviceForMac: function(hosts, mac) {
		var wanted = String(mac || '').toLowerCase();
		var key = Object.keys(hosts || {}).sort().find(function(candidate) {
			return candidate.toLowerCase() === wanted;
		});
		if (!key)
			return null;
		var host = hosts[key] || {};
		var addresses = Array.isArray(host.ipaddrs) ? host.ipaddrs :
			(host.ipaddrs ? [ host.ipaddrs ] : []);
		return {
			mac: key,
			name: host.name || '',
			ipaddrs: addresses.filter(Boolean)
		};
	},

	hostsForZone: function(hosts, zones, interfaces, zoneName) {
		var zone = (zones || []).find(function(candidate) {
			return candidate.name === zoneName;
		});
		if (!zone)
			return {};
		var networkNames = toArray(zone.network);
		if (!networkNames.length && zone.name)
			networkNames.push(zone.name);
		var subnets = [];
		(interfaces || []).forEach(function(iface) {
			if (networkNames.indexOf(iface.interface) === -1)
				return;
			toArray(iface['ipv4-address']).forEach(function(address) {
				if (address && address.address != null && address.mask != null)
					subnets.push({ address: address.address, mask: address.mask });
			});
		});
		var filtered = {};
		Object.keys(hosts || {}).sort().forEach(function(mac) {
			var host = hosts[mac] || {};
			var addresses = toArray(host.ipaddrs).filter(function(address) {
				return subnets.some(function(subnet) {
					return inSubnet(address, subnet.address, subnet.mask);
				});
			});
			if (addresses.length)
				filtered[mac] = { name: host.name || '', ipaddrs: addresses };
		});
		return filtered;
	},

	bindingName: function(device, savedMac, savedName) {
		if (!device)
			return '';
		if (device.name)
			return device.name;
		if (device.mac.toLowerCase() === String(savedMac || '').toLowerCase() && savedName)
			return this.displayName(savedName);
		return device.ipaddrs[0] || device.mac;
	},

	weekdaySummary: function(value, labels) {
		var days = normalizedDays(value);
		labels = labels || {};
		if (days.length === 0 || days.length === 7)
			return labels.everyday || 'Every day';
		if (days.join(' ') === 'Mon Tue Wed Thu Fri')
			return labels.weekdays || 'Weekdays';
		if (days.join(' ') === 'Sat Sun')
			return labels.weekend || 'Weekend';
		return days.map(function(day) {
			return labels[day] || day;
		}).join(' / ');
	},

	scheduleSummary: function(start, stop, weekdays, labels) {
		if (!start && !stop)
			return ((labels && labels.allDay) || 'All day') + ' · ' + this.weekdaySummary(weekdays, labels);
		var startShort = shortTime(start);
		var stopShort = shortTime(stop);
		var overnight = startShort > stopShort;
		return startShort + ' → ' +
			(overnight ? ((labels && labels.overnight) || 'next day') + ' ' : '') +
			stopShort + ' · ' + this.weekdaySummary(weekdays, labels);
	}
});
