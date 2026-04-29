'use strict';
'require view';
'require uci';
'require fs';
'require ui';

var TMP_DIR = '/tmp/easyupdate';
var MARKER_FILE = TMP_DIR + '/firmware_filename';
var LOG_FILE = TMP_DIR + '/curl.log';
var PID_FILE = TMP_DIR + '/download.pid';
var FIRMWARE_REPO_OWNER = 'FanxJK';
var FIRMWARE_REPO_NAME = 'OpenWrt-x86_64-Actions';
var FIRMWARE_REPO_URL = 'https://github.com/' + FIRMWARE_REPO_OWNER + '/' + FIRMWARE_REPO_NAME;

function normalizeFilename(name) {
	var match = String(name || '').replace(/[\r\n]/g, '').trim().match(/([A-Za-z0-9._-]+\.img\.gz)$/);
	return match ? match[1] : null;
}

function basename(path) {
	return String(path || '').replace(/[?#].*$/, '').replace(/^.*\//, '');
}

function filePath(name) {
	return TMP_DIR + '/' + normalizeFilename(name);
}

function shaPath(name) {
	return filePath(name) + '.sha256';
}

function versionTime(value) {
	var match = String(value || '').match(/-(\d{4})\.(\d{1,2})\.(\d{1,2})/);

	if (!match)
		return 0;

	return Date.UTC(+match[1], +match[2] - 1, +match[3]) / 1000;
}

function parseLocalVersion(release) {
	var match = String(release || '').match(/DISTRIB_GITHUBVER=['"]?([^'"\n]+)['"]?/);
	return match ? match[1] : '';
}

function humanSize(size) {
	size = Number(size) || 0;

	if (size >= 1073741824)
		return (size / 1073741824).toFixed(2) + ' GiB';

	if (size >= 1048576)
		return (size / 1048576).toFixed(2) + ' MiB';

	if (size >= 1024)
		return (size / 1024).toFixed(2) + ' KiB';

	return size + ' B';
}

function pad2(value) {
	value = String(value);
	return value.length < 2 ? '0' + value : value;
}

function findAsset(release, isEfi) {
	var suffix = isEfi ? 'combined-efi.img.gz' : 'combined.img.gz';
	var assets = release && Array.isArray(release.assets) ? release.assets : [];
	var asset = null;
	var sha = null;

	for (var i = 0; i < assets.length; i++) {
		var name = assets[i] && assets[i].name ? assets[i].name : basename(assets[i] && assets[i].browser_download_url);

		if (!asset && name.slice(-suffix.length) === suffix)
			asset = assets[i];

		if (!sha && name.toLowerCase() === 'sha256sums')
			sha = assets[i];
	}

	if (!asset || !asset.browser_download_url)
		return null;

	var file = normalizeFilename(asset.name) || normalizeFilename(basename(asset.browser_download_url));

	if (!file)
		return null;

	return {
		name: file,
		url: asset.browser_download_url,
		size: Number(asset.size) || 0,
		shaUrl: sha && sha.browser_download_url ? sha.browser_download_url : asset.browser_download_url.replace(/[^\/]+$/, 'SHA256SUMS')
	};
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('easyupdate'),
			L.resolveDefault(fs.read('/etc/openwrt_release'), ''),
			L.resolveDefault(fs.stat('/sys/firmware/efi'), null),
			L.resolveDefault(fs.read(MARKER_FILE), '')
		]);
	},

	render: function(data) {
		this.state = {
			localVersion: parseLocalVersion(data[1]),
			isEfi: !!data[2],
			fileName: normalizeFilename(data[3]),
			release: null,
			asset: null,
			action: null
		};
		this.nodes = {};
		this.logLines = [];
		this.progressTimer = null;

		var node = this.renderPanel();
		var self = this;

		window.setTimeout(function() {
			self.refreshRelease();
		}, 0);

		return node;
	},

	renderPanel: function() {
		this.nodes.mirror = E('input', {
			'class': 'cbi-input-text',
			type: 'text',
			placeholder: _('Optional mirror URL'),
			value: uci.get('easyupdate', 'main', 'mirror') || ''
		});
		this.nodes.keepconfig = E('input', {
			type: 'checkbox'
		});
		this.nodes.keepconfig.checked = uci.get('easyupdate', 'main', 'keepconfig') !== '0';
		this.nodes.forceflash = E('input', {
			type: 'checkbox'
		});
		this.nodes.forceflash.checked = uci.get('easyupdate', 'main', 'forceflash') === '1';
		this.nodes.cloud = E('span', { 'class': 'easyupdate-version-value' }, _('Collecting data...'));
		this.nodes.release = E('pre', { 'class': 'easyupdate-release' }, _('Collecting data...'));
		this.nodes.progressBar = E('div', { 'class': 'easyupdate-progress-bar' });
		this.nodes.progress = E('div', {
			'class': 'easyupdate-progress',
			style: 'display: none;'
		}, this.nodes.progressBar);
		this.nodes.progressText = E('div', {
			'class': 'easyupdate-progress-text',
			style: 'display: none;'
		}, '');
		this.nodes.button = E('button', {
			'class': 'cbi-button cbi-button-action easyupdate-button',
			type: 'button',
			disabled: 'disabled',
			click: this.handleAction.bind(this)
		}, _('Collecting data...'));
		this.nodes.log = E('textarea', {
			'class': 'cbi-input-textarea easyupdate-log',
			readonly: 'readonly',
			style: 'display: none;'
		});

		return E('div', { 'class': 'cbi-map easyupdate-map' }, [
			E('style', {}, [
				'.easyupdate-map{max-width:none;margin:0}',
				'.easyupdate-map .cbi-map-descr{line-height:1.6;margin-bottom:18px}',
				'.easyupdate-map .cbi-section{padding:22px 24px;margin-top:18px}',
					'.easyupdate-map .cbi-section h3{margin-top:0;margin-bottom:18px}',
					'.easyupdate-setting-row{display:grid;grid-template-columns:1fr 240px 240px;gap:20px;align-items:stretch}',
				'.easyupdate-setting-box{min-width:0;padding:14px 16px;border:1px solid rgba(127,127,127,.14);border-radius:4px;background:rgba(127,127,127,.035)}',
				'.easyupdate-setting-box label{font-weight:600}',
				'.easyupdate-setting-help{display:block;margin-top:8px;opacity:.68;line-height:1.45}',
				'.easyupdate-map .cbi-input-text{box-sizing:border-box;width:100%;max-width:520px;margin-top:8px}',
				'.easyupdate-check{display:flex;align-items:center;gap:10px;min-height:34px}',
				'.easyupdate-version-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}',
				'.easyupdate-version-item{padding:18px 20px;border:1px solid rgba(127,127,127,.18);border-radius:4px;background:rgba(127,127,127,.04)}',
				'.easyupdate-version-label{display:block;margin-bottom:8px;opacity:.7}',
				'.easyupdate-version-value{font-weight:700;word-break:break-word}',
				'.easyupdate-release{box-sizing:border-box;width:100%;min-height:150px;max-height:360px;overflow:auto;margin:0;padding:14px 16px;white-space:pre-wrap;line-height:1.6}',
				'.easyupdate-actions{text-align:center;padding-top:4px;padding-bottom:4px}',
				'.easyupdate-button{min-width:200px}',
				'.easyupdate-progress{height:16px;margin:18px auto 0;max-width:680px;border-radius:3px;background:rgba(127,127,127,.18);overflow:hidden}',
				'.easyupdate-progress-bar{height:100%;width:0%;background:#0069d9;transition:width .25s ease}',
				'.easyupdate-progress-text{margin-top:10px;text-align:center;font-weight:600}',
				'.easyupdate-log{box-sizing:border-box;width:100%!important;height:240px;margin-top:0;padding:12px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace}',
				'@media (max-width:900px){.easyupdate-setting-row,.easyupdate-version-grid{grid-template-columns:1fr}.easyupdate-map .cbi-section{padding:18px}}'
			].join('\n')),
			E('h2', {}, _('Firmware Update')),
			E('div', { 'class': 'cbi-map-descr' }, [
				_('Check the latest firmware, adjust upgrade options, download with progress, verify integrity, and upgrade from this page.'),
				E('br'),
				_('Firmware Source') + ': ',
				E('a', { href: FIRMWARE_REPO_URL, target: '_blank', rel: 'noreferrer noopener' }, FIRMWARE_REPO_OWNER + '/' + FIRMWARE_REPO_NAME)
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Upgrade Settings')),
				E('div', { 'class': 'easyupdate-setting-row' }, [
					E('div', { 'class': 'easyupdate-setting-box' }, [
						E('label', {}, _('Mirror Url')),
						this.nodes.mirror,
						E('small', { 'class': 'easyupdate-setting-help' }, _('Once configured, the mirror URL will be used when accessing Github release assets.'))
					]),
					E('div', { 'class': 'easyupdate-setting-box' }, [
						E('label', { 'class': 'easyupdate-check' }, [ this.nodes.keepconfig, _('KEEP CONFIG') ]),
						E('small', { 'class': 'easyupdate-setting-help' }, _('When selected, configuration is retained when firmware upgrade.'))
					]),
					E('div', { 'class': 'easyupdate-setting-box' }, [
						E('label', { 'class': 'easyupdate-check' }, [ this.nodes.forceflash, _('Preference Force Flashing') ]),
						E('small', { 'class': 'easyupdate-setting-help' }, _('When selected, Preference Force Flashing while firmware upgrading.'))
					])
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Firmware Status')),
				E('div', { 'class': 'easyupdate-version-grid' }, [
					E('div', { 'class': 'easyupdate-version-item' }, [
						E('span', { 'class': 'easyupdate-version-label' }, _('Local Firmware Version')),
						E('span', { 'class': 'easyupdate-version-value' }, this.state.localVersion || _('Unknown'))
					]),
					E('div', { 'class': 'easyupdate-version-item' }, [
						E('span', { 'class': 'easyupdate-version-label' }, _('Cloud Firmware Version')),
						this.nodes.cloud
					])
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Release Notes')),
				this.nodes.release
			]),
			E('div', { 'class': 'cbi-section easyupdate-actions' }, [
				this.nodes.button,
				this.nodes.progress,
				this.nodes.progressText
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, _('Update Log')),
				this.nodes.log
			])
		]);
	},

	saveSettings: function() {
		uci.set('easyupdate', 'main', 'mirror', this.nodes.mirror ? this.nodes.mirror.value.trim() : '');
		uci.set('easyupdate', 'main', 'keepconfig', this.nodes.keepconfig && this.nodes.keepconfig.checked ? '1' : '0');
		uci.set('easyupdate', 'main', 'forceflash', this.nodes.forceflash && this.nodes.forceflash.checked ? '1' : '0');

		return uci.save();
	},

	handleSaveApply: function(ev) {
		return this.saveSettings().then(L.bind(function() {
			return this.super('handleSaveApply', [ ev ]);
		}, this));
	},

	handleSave: function(ev) {
		return this.saveSettings().then(L.bind(function() {
			return this.super('handleSave', [ ev ]);
		}, this));
	},

	handleReset: function(ev) {
		if (this.nodes.mirror)
			this.nodes.mirror.value = uci.get('easyupdate', 'main', 'mirror') || '';

		if (this.nodes.keepconfig)
			this.nodes.keepconfig.checked = uci.get('easyupdate', 'main', 'keepconfig') !== '0';

		if (this.nodes.forceflash)
			this.nodes.forceflash.checked = uci.get('easyupdate', 'main', 'forceflash') === '1';

		return this.super('handleReset', [ ev ]);
	},

	exec: function(command, args) {
		return fs.exec(command, args || []).then(function(res) {
			res = res || {};

			if (res.code != null && +res.code !== 0)
				throw new Error((res.stderr || res.stdout || _('Command failed')).trim());

			return res;
		});
	},

	execAny: function(commands, args) {
		var self = this;
		var i = 0;

		function next() {
			if (i >= commands.length)
				return Promise.reject(new Error(_('Command not found')));

			return self.exec(commands[i++], args).catch(next);
		}

		return next();
	},

	ensureTmpDir: function() {
		return this.exec('/bin/mkdir', [ '-p', TMP_DIR ]);
	},

	curl: function(url, output) {
		var args = [ '-fL', '-sS' ];

		if (output)
			args.push('-o', output);

		args.push(url);
		return this.exec('/usr/bin/curl', args);
	},

	assetUrl: function(url) {
		return String(this.nodes.mirror ? this.nodes.mirror.value.trim() : (uci.get('easyupdate', 'main', 'mirror') || '')) + url;
	},

	refreshRelease: function() {
		var self = this;

		this.setAction(null, _('Collecting data...'), true);
		this.setProgress(0, 0);
		this.appendLog(_('Checking cloud firmware version...'));

		return this.ensureTmpDir().then(function() {
			return self.curl('https://api.github.com/repos/' + FIRMWARE_REPO_OWNER + '/' + FIRMWARE_REPO_NAME + '/releases/latest');
		}).then(function(res) {
			var release;
			var asset;

			try {
				release = JSON.parse(res.stdout || '{}');
			} catch (e) {
				throw new Error(_('Failed to parse release information'));
			}

			if (release.message && !release.tag_name)
				throw new Error(release.message);

			asset = findAsset(release, self.state.isEfi);
			self.state.release = release;
			self.state.asset = asset;
			self.nodes.cloud.textContent = release.tag_name || _('Unknown');
			self.nodes.release.textContent = release.body || _('No release notes.');

			if (!asset)
				throw new Error(_('Cloud firmware link parse failed'));

			return self.restoreOrPrepare();
		}).catch(function(err) {
			self.nodes.cloud.textContent = _('API Check Failed');
			self.nodes.release.textContent = err.message || String(err);
			self.setAction('refresh', _('Retry Firmware Check'), false);
			self.appendLog(_('Firmware check failed') + ': ' + (err.message || err));
		});
	},

	restoreOrPrepare: function() {
		var asset = this.state.asset;
		var self = this;

		if (this.state.fileName === asset.name) {
			return this.pidRunning().then(function(running) {
				if (running) {
					self.setAction(null, _('Downloading...'), true);
					self.appendLog(_('Firmware download is still running.'));
					return self.pollDownload();
				}

				return L.resolveDefault(fs.stat(filePath(asset.name)), null).then(function(stat) {
					if (stat)
						return self.checkFirmware(false);

					return self.prepareDownloadButton();
				});
			});
		}

		return this.prepareDownloadButton();
	},

	prepareDownloadButton: function() {
		var releaseTime = versionTime(this.state.release && this.state.release.tag_name);
		var localTime = versionTime(this.state.localVersion);

		if (releaseTime > localTime) {
			this.setAction('download', _('Download Firmware'), false);
			this.appendLog(_('New firmware is available.'));
		} else {
			this.setAction('refresh', _('Is the latest'), true);
			this.appendLog(_('Is the latest'));
		}
	},

	handleAction: function(ev) {
		if (ev)
			ev.preventDefault();

		if (this.state.action === 'download')
			this.downloadFirmware();
		else if (this.state.action === 'flash')
			this.flashFirmware();
		else if (this.state.action === 'refresh')
			this.refreshRelease();

		return false;
	},

	downloadFirmware: function() {
		var asset = this.state.asset;
		var self = this;

		if (!asset)
			return this.fail(_('Cloud firmware link parse failed'));

		this.state.fileName = asset.name;
		this.logLines = [];
		this.appendLog(_('Start downloading firmware') + ': ' + asset.name);
		this.setAction(null, _('Downloading...'), true);
		this.setProgress(0, asset.size);

		return this.cleanup(asset.name).then(function() {
			return self.ensureTmpDir();
		}).then(function() {
			return fs.write(MARKER_FILE, asset.name + '\n');
		}).then(function() {
			self.appendLog(_('Downloading checksum file...'));
			return self.curl(self.assetUrl(asset.shaUrl), shaPath(asset.name));
		}).then(function() {
			self.appendLog(_('Downloading firmware...'));
			return self.exec('/sbin/start-stop-daemon', [
				'-S', '-b', '-m', '-p', PID_FILE, '-x', '/usr/bin/curl', '--',
				'-fL', '-sS', '--stderr', LOG_FILE, '-o', filePath(asset.name), self.assetUrl(asset.url)
			]);
		}).then(function() {
			return self.pollDownload();
		}).catch(function(err) {
			self.setAction('download', _('Retry Firmware Download'), false);
			self.appendLog(_('Download error') + ': ' + (err.message || err));
		});
	},

	pollDownload: function() {
		var self = this;
		var asset = this.state.asset;
		var total = asset.size || 0;
		var lastSize = -1;
		var stableTicks = 0;

		return new Promise(function(resolve, reject) {
			function tick() {
				L.resolveDefault(fs.stat(filePath(asset.name)), null).then(function(stat) {
					var size = stat && stat.size ? Number(stat.size) : 0;

					if (size === lastSize)
						stableTicks++;
					else
						stableTicks = 0;

					lastSize = size;
					self.setProgress(size, total);

					self.pidRunning().then(function(running) {
						if (!running) {
							L.resolveDefault(fs.remove(PID_FILE), null);

							if ((total === 0 && size > 0) || (total > 0 && size >= total)) {
								self.setProgress(total || size, total || size);
								self.appendLog(_('Download completes'));
								self.checkFirmware(true).then(resolve, reject);
							} else {
								self.readCurlLog().then(function(log) {
									reject(new Error(log || _('Download error')));
								});
							}

							return;
						}

						if (stableTicks >= 120)
							reject(new Error(_('Download timeout')));
						else
							self.progressTimer = window.setTimeout(tick, 1000);
					});
				}).catch(reject);
			}

			tick();
		});
	},

	pidRunning: function() {
		return L.resolveDefault(fs.read(PID_FILE), '').then(function(pid) {
			pid = String(pid || '').trim();

			if (!/^\d+$/.test(pid))
				return false;

			return L.resolveDefault(fs.exec('/bin/kill', [ '-0', pid ]), { code: 1 }).then(function(res) {
				return res && +res.code === 0;
			});
		});
	},

	readCurlLog: function() {
		return L.resolveDefault(fs.read(LOG_FILE), '').then(function(log) {
			return String(log || '').trim();
		});
	},

	checkFirmware: function(showLog) {
		var self = this;
		var asset = this.state.asset;

		if (!asset)
			return Promise.resolve(false);

		if (showLog)
			this.appendLog(_('Checking firmware integrity...'));

		return L.resolveDefault(fs.read(shaPath(asset.name)), null).then(function(content) {
			if (content != null)
				return content;

			return self.curl(self.assetUrl(asset.shaUrl), shaPath(asset.name)).then(function() {
				return fs.read(shaPath(asset.name));
			});
		}).then(function(content) {
			var expected = self.expectedHash(content, asset.name);

			if (!expected)
				throw new Error(_('SHA entry not found'));

			return self.execAny([ '/usr/bin/sha256sum', '/bin/sha256sum' ], [ filePath(asset.name) ]).then(function(res) {
				var actual = String(res.stdout || '').match(/^([a-fA-F0-9]{64})/);

				if (!actual)
					throw new Error(_('Checksum command failed'));

				if (actual[1].toLowerCase() !== expected.toLowerCase())
					throw new Error(_('Checksum mismatch'));

				self.state.fileName = asset.name;
				self.setAction('flash', _('Firmware Upgrade'), false);
				self.appendLog(_('Firmware integrity check') + ': OK');
				return true;
			});
		}).catch(function(err) {
			self.setAction('download', _('Retry Firmware Download'), false);
			self.appendLog(_('Firmware integrity check') + ': ' + (err.message || err));
			return false;
		});
	},

	expectedHash: function(content, fileName) {
		var lines = String(content || '').split(/\r?\n/);

		for (var i = 0; i < lines.length; i++) {
			var match = lines[i].match(/^([a-fA-F0-9]{64})\s+\*?(.+?)\s*$/);

			if (match && basename(match[2]) === fileName)
				return match[1];
		}

		return null;
	},

	flashFirmware: function() {
		var file = normalizeFilename(this.state.fileName);
		var args = [];
		var self = this;

		if (!file)
			return this.fail(_('Invalid filename'));

		if (!window.confirm(_('The firmware is being upgraded, please wait. DO NOT power off the device!')))
			return;

		if (this.nodes.forceflash && this.nodes.forceflash.checked)
			args.push('-F');

		if (!this.nodes.keepconfig || !this.nodes.keepconfig.checked)
			args.push('-n');

		args.push(filePath(file));
		this.setAction(null, _('Firmware Upgrading'), true);
		this.appendLog(_('Start flash firmware'));
		ui.showModal(_('Firmware Upgrading'), [
			E('p', {}, _('The firmware is being upgraded, please wait...')),
			E('p', { style: 'color: #e53935; font-weight: bold;' }, _('DO NOT power off the device!'))
		]);

		return this.exec('/sbin/start-stop-daemon', [ '-S', '-b', '-x', '/sbin/sysupgrade', '--' ].concat(args)).catch(function(err) {
			ui.hideModal();
			self.setAction('flash', _('Retry Firmware Upgrade'), false);
			self.appendLog(_('Firmware upgrade failed') + ': ' + (err.message || err));
		});
	},

	cleanup: function(file) {
		var paths = [ PID_FILE, LOG_FILE, MARKER_FILE ];
		var safe = normalizeFilename(file);

		if (safe) {
			paths.push(filePath(safe));
			paths.push(shaPath(safe));
		}

		return Promise.all(paths.map(function(path) {
			return L.resolveDefault(fs.remove(path), null);
		}));
	},

	setAction: function(action, label, disabled) {
		this.state.action = action;

		if (this.nodes.button) {
			this.nodes.button.textContent = label;
			this.nodes.button.disabled = !!disabled;
		}
	},

	setProgress: function(size, total) {
		var percent = total > 0 ? Math.min(100, Math.floor(size * 100 / total)) : 0;

		if (!this.nodes.progress || !this.nodes.progressBar || !this.nodes.progressText)
			return;

		if (total > 0 || size > 0) {
			this.nodes.progress.style.display = '';
			this.nodes.progressText.style.display = '';
		} else {
			this.nodes.progress.style.display = 'none';
			this.nodes.progressText.style.display = 'none';
		}

		this.nodes.progressBar.style.width = percent + '%';
		this.nodes.progressText.textContent = total > 0 ?
			percent + '% (' + humanSize(size) + ' / ' + humanSize(total) + ')' :
			humanSize(size);
	},

	appendLog: function(message) {
		var now = new Date();
		var time = now.getFullYear() + '-' + pad2(now.getMonth() + 1) + '-' + pad2(now.getDate()) + ' ' +
			pad2(now.getHours()) + ':' + pad2(now.getMinutes()) + ':' + pad2(now.getSeconds());

		this.logLines.push('[' + time + '] ' + message);

		if (this.nodes.log) {
			this.nodes.log.style.display = '';
			this.nodes.log.value = this.logLines.join('\n');
			this.nodes.log.scrollTop = this.nodes.log.scrollHeight;
		}
	},

	fail: function(message) {
		this.setAction('refresh', _('Retry Firmware Check'), false);
		this.appendLog(message);
		ui.addNotification(null, E('p', {}, message), 'danger');
	}
});
