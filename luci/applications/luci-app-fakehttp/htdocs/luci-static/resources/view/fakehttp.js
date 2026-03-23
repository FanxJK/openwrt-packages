'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require fs';
'require tools.widgets as widgets';

var callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: [ 'name' ],
	expect: { '': {} }
});

function normalizeList(value) {
	if (Array.isArray(value))
		return value.map(function(entry) {
			return String(entry).trim();
		}).filter(function(entry) {
			return entry.length > 0;
		});

	if (value == null)
		return [];

	value = String(value).trim();
	return value ? [ value ] : [];
}

function normalizeValue(value) {
	if (value == null)
		return '';

	return String(value).trim();
}

function getOptionValue(config, option, sectionId) {
	var value = option.formvalue(sectionId);

	if (value == null)
		value = uci.get(config, sectionId, option.option);

	return value;
}

function hasListValue(config, option, sectionId) {
	return normalizeList(getOptionValue(config, option, sectionId)).length > 0;
}

function currentListValue(config, option, sectionId) {
	return normalizeList(getOptionValue(config, option, sectionId));
}

function inferMode(config, sectionId, fallbackMode) {
	var configuredMode = normalizeValue(uci.get(config, sectionId, 'mode'));

	if (configuredMode)
		return configuredMode;

	return normalizeList(uci.get(config, sectionId, 'payload_file')).length > 0 ? 'payload' : fallbackMode;
}

function normalizePayloadSelection(value, payloadDir) {
	var items = normalizeList(value);
	var seen = {};
	var result = [];
	var i, item;

	for (i = 0; i < items.length; i++) {
		item = items[i];

		if (item.indexOf(payloadDir + '/') === 0)
			item = item.slice(payloadDir.length + 1);
		else if (item.charAt(0) === '/')
			item = item.slice(1);

		while (item.indexOf('./') === 0)
			item = item.slice(2);

		if (!item || item === '.' || item === '..' || item.indexOf('/') !== -1 || seen[item])
			continue;

		seen[item] = true;
		result.push(item);
	}

	return result;
}

function formatPayloadLabel(entry) {
	var size = (entry != null && entry.size != null) ? entry.size + ' B' : '? B';
	var date = '';

	if (entry != null && entry.mtime != null) {
		try {
			date = ' | ' + new Date(entry.mtime * 1000).toLocaleString();
		} catch (e) {
			date = '';
		}
	}

	return entry.name + ' | ' + size + date;
}

return view.extend({
	load: function() {
		var payloadDir = '/etc/fakehttp/payloads';

		return Promise.all([
			uci.load('fakehttp'),
			L.resolveDefault(fs.list(payloadDir), [])
		]);
	},

	render: function(data) {
		var payloadDir = '/etc/fakehttp/payloads';
		var payloadEntries = (data[1] || []).filter(function(entry) {
			return entry.type === 'file';
		}).sort(function(a, b) {
			return a.name.localeCompare(b.name);
		});
		var m = new form.Map('fakehttp', 'FakeHTTP',
			'FakeHTTP 可以将你的 TCP 连接伪装成 HTTP/HTTPS 流量以规避 DPI 检测，基于 nftables / iptables 的 Netfilter Queue (NFQUEUE)。<br />' +
			'用法: <a href="https://github.com/MikeWang000000/FakeHTTP/wiki" target="_blank">https://github.com/MikeWang000000/FakeHTTP/wiki</a>'
		);

		var statusSection = m.section(form.TypedSection, 'fakehttp');
		statusSection.anonymous = true;
		statusSection.addremove = false;
		statusSection.template = 'cbi/nullsection';

		var status = statusSection.option(form.DummyValue, '_status');
		status.render = function() {
			return callServiceList('fakehttp').then(function(res) {
				var isRunning = false;

				try {
					isRunning = res.fakehttp && res.fakehttp.instances &&
						Object.keys(res.fakehttp.instances).length > 0;
				} catch (e) {
					isRunning = false;
				}

				var statusText = isRunning ?
					'<em><b><font color="green">FakeHTTP ' + _('RUNNING') + '</font></b></em>' :
					'<em><b><font color="red">FakeHTTP ' + _('NOT RUNNING') + '</font></b></em>';

				return E('fieldset', { class: 'cbi-section' }, [
					E('p', { style: 'margin: 10px; font-size: 16px;' }, statusText)
				]);
			}).catch(function() {
				return E('fieldset', { class: 'cbi-section' }, [
					E('p', { style: 'margin: 10px; font-size: 16px;' }, '<em>' + _('Collecting data...') + '</em>')
				]);
			});
		};

		var s = m.section(form.NamedSection, 'main', 'fakehttp');
		s.anonymous = true;

		var oEnabled = s.option(form.Flag, 'enabled', '启用服务');
		oEnabled.default = '0';
		oEnabled.rmempty = false;

		var oMode = s.option(form.ListValue, 'mode', '工作模式',
			'显式选择当前使用主机名混淆还是二进制负载模式，切换模式时无需手动清空另一组配置。');
		oMode.value('host', '主机名模式 (-h / -e)');
		oMode.value('payload', '二进制文件模式 (-b)');
		oMode.default = 'host';
		oMode.rmempty = false;
		oMode.cfgvalue = function(sectionId) {
			return inferMode('fakehttp', sectionId, 'host');
		};

		var currentMode = function(sectionId) {
			return normalizeValue(getOptionValue('fakehttp', oMode, sectionId)) || inferMode('fakehttp', sectionId, 'host');
		};

		var oHost = s.option(form.DynamicList, 'host', '用于 HTTP 混淆的主机名 (-h)',
			'主机名模式下生效。至少填写一个 HTTP 或 HTTPS 主机名。');
		oHost.rmempty = true;
		oHost.retain = true;
		oHost.depends('mode', 'host');
		oHost.validate = function(sectionId) {
			if (currentMode(sectionId) !== 'host')
				return true;

			if (currentListValue('fakehttp', oHost, sectionId).length > 0 || hasListValue('fakehttp', oHttpsHost, sectionId))
				return true;

			return '主机名模式下至少需要填写一个 -h 或 -e';
		};

		var oHttpsHost = s.option(form.DynamicList, 'httpshost', '用于 HTTPS 混淆的主机名 (-e)',
			'主机名模式下生效。至少填写一个 HTTP 或 HTTPS 主机名。');
		oHttpsHost.rmempty = true;
		oHttpsHost.retain = true;
		oHttpsHost.depends('mode', 'host');
		oHttpsHost.validate = function(sectionId) {
			if (currentMode(sectionId) !== 'host')
				return true;

			if (currentListValue('fakehttp', oHttpsHost, sectionId).length > 0 || hasListValue('fakehttp', oHost, sectionId))
				return true;

			return '主机名模式下至少需要填写一个 -h 或 -e';
		};

		var oPayloadManager = s.option(form.FileUpload, '_payload_manager', 'Payload 目录管理',
			'用于上传、下载、删除 ' + payloadDir + ' 中的文件。上传或删除后，请点击下方“刷新 Payload 列表”再勾选要生效的文件。');
		oPayloadManager.root_directory = payloadDir;
		oPayloadManager.browser = true;
		oPayloadManager.enable_upload = true;
		oPayloadManager.enable_remove = true;
		oPayloadManager.enable_download = true;
		oPayloadManager.show_hidden = false;
		oPayloadManager.rmempty = true;
		oPayloadManager.retain = true;
		oPayloadManager.depends('mode', 'payload');
		oPayloadManager.cfgvalue = function() {
			return '';
		};
		oPayloadManager.write = function() {};
		oPayloadManager.remove = function() {};

		var oPayloadRefresh = s.option(form.Button, '_payload_refresh', '刷新 Payload 列表');
		oPayloadRefresh.inputtitle = '刷新文件列表';
		oPayloadRefresh.inputstyle = 'reload';
		oPayloadRefresh.depends('mode', 'payload');
		oPayloadRefresh.onclick = function() {
			window.location.reload();
			return false;
		};

		var oPayloadFiles = s.option(form.MultiValue, 'payload_file', '选择生效的 Payload 文件 (-b)',
			'勾选目录下要使用的 payload 文件，可多选；后端会为每个勾选文件追加一个 -b 参数。');
		oPayloadFiles.rmempty = true;
		oPayloadFiles.retain = true;
		oPayloadFiles.create = false;
		oPayloadFiles.display_size = 8;
		oPayloadFiles.dropdown_size = 12;
		oPayloadFiles.depends('mode', 'payload');
		oPayloadFiles.cfgvalue = function(sectionId) {
			return normalizePayloadSelection(uci.get('fakehttp', sectionId, 'payload_file'), payloadDir);
		};
		oPayloadFiles.validate = function(sectionId, value) {
			if (currentMode(sectionId) !== 'payload')
				return true;

			value = normalizePayloadSelection(value, payloadDir);

			if (value.length > 0)
				return true;

			if (payloadEntries.length === 1)
				return true;

			if (payloadEntries.length === 0)
				return '请先上传至少一个 payload 文件';

			return '二进制文件模式下请至少勾选一个 payload 文件';
		};

		if (payloadEntries.length === 0) {
			oPayloadFiles.value('', '当前目录中暂无可选 payload 文件');
			oPayloadFiles.readonly = true;
		} else {
			payloadEntries.forEach(function(entry) {
				oPayloadFiles.value(entry.name, formatPayloadLabel(entry));
			});
		}

		var i = s.option(widgets.DeviceSelect, 'iface', '网络接口名称 (-i)',
			'可以添加多个网络接口，每个接口对应一个 -i 参数');
		i.multiple = true;
		i.rmempty = false;
		i.nocreate = false;

		var mopt = s.option(form.Value, 'fwmark', '用于绕过队列的 fwmark (-m)');
		mopt.datatype = 'uinteger';
		mopt.rmempty = true;

		var nopt = s.option(form.Value, 'num', 'Netfilter 队列编号 (-n)');
		nopt.datatype = 'uinteger';
		nopt.rmempty = true;

		var ropt = s.option(form.Value, 'repeat', '重复生成的数据包次数 (-r)');
		ropt.datatype = 'uinteger';
		ropt.rmempty = true;

		var topt = s.option(form.Value, 'ttl', '生成数据包的 TTL (-t)', '默认值为 3');
		topt.datatype = 'uinteger';
		topt.rmempty = true;

		var xopt = s.option(form.Value, 'mask', '设置 fwmark 的掩码 (-x)');
		xopt.datatype = 'uinteger';
		xopt.rmempty = true;

		var yopt = s.option(form.Value, 'pct', '将 TTL 动态提升到估算路由跳数的百分比 (-y)');
		yopt.datatype = 'uinteger';
		yopt.rmempty = true;

		return m.render();
	},

	handleSaveApply: function(ev) {
		return this.super('handleSaveApply', [ ev ]);
	}
});
