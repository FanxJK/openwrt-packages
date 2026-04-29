'use strict';
'require view';
'require form';
'require uci';
'require fs';
'require ui';

var TMP_DIR = '/tmp/easyupdate';
var MARKER_FILE = TMP_DIR + '/firmware_filename';
var LOG_FILE = TMP_DIR + '/curl.log';
var PID_FILE = TMP_DIR + '/download.pid';
var DEFAULT_GITHUB = 'https://github.com/FanxJK/OpenWrt-x86_64-Actions';

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

function parseGithubRepo(value) {
	var match = String(value || '').trim().match(/^https?:\/\/github\.com\/([^\/\s]+)\/([^\/#?\s]+)(?:[\/#?].*)?$/);

	if (!match)
		return null;

	return {
		owner: match[1],
		repo: match[2].replace(/\.git$/, '')
	};
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
		var m = new form.Map('easyupdate', _('EasyUpdate'),
			_('EasyUpdate supports one-click firmware upgrade.') + '<br />' +
			_('Update may cause restart failure, please proceed with caution.') + '<br /><br />' +
			'<a href="https://github.com/FanxJK/OpenWrt-x86_64-Actions" target="_blank" rel="noreferrer noopener">Powered by Fanx</a>');
		var s = m.section(form.NamedSection, 'main', 'easyupdate');
		var self = this;
		var o;

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

		s.anonymous = true;

		o = s.option(form.Value, 'github', _('Github project address'));
		o.default = DEFAULT_GITHUB;
		o.rmempty = false;
		o.validate = function(sectionId, value) {
			return parseGithubRepo(value) ? true : _('Invalid GitHub repository URL');
		};

		o = s.option(form.Value, 'mirror', _('Mirror Url'), _('Once configured, the mirror URL will be used when accessing Github release assets.'));
		o.default = '';
		o.placeholder = '';
		o.rmempty = true;

		o = s.option(form.Flag, 'keepconfig', _('KEEP CONFIG'), _('When selected, configuration is retained when firmware upgrade.'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Flag, 'forceflash', _('Preference Force Flashing'), _('When selected, Preference Force Flashing while firmware upgrading.'));
		o.default = '0';
		o.rmempty = false;

		o = s.option(form.DummyValue, '_easyupdate', _('Firmware Upgrade'));
		o.render = function() {
			return self.renderPanel();
		};

		return m.render().then(function(node) {
			window.setTimeout(function() {
				self.refreshRelease();
			}, 0);

			return node;
		});
	},

	renderPanel: function() {
		this.nodes.cloud = E('span', _('Collecting data...'));
		this.nodes.release = E('pre', {
			style: 'white-space: pre-wrap; max-height: 350px; overflow-y: auto; padding: 8px; border: 1px solid #ddd; background: #f9f9f9; border-radius: 4px;'
		}, _('Collecting data...'));
		this.nodes.progressBar = E('div', {
			style: 'height: 100%; width: 0%; background: #0069d9; transition: width .2s;'
		});
		this.nodes.progress = E('div', {
			style: 'height: 18px; width: 100%; border: 1px solid #ccc; background: #f5f5f5; margin-top: 8px; display: none;'
		}, this.nodes.progressBar);
		this.nodes.progressText = E('div', {
			style: 'margin-top: 4px; display: none;'
		}, '');
		this.nodes.button = E('button', {
			'class': 'cbi-button cbi-button-reload',
			type: 'button',
			disabled: 'disabled',
			click: this.handleAction.bind(this)
		}, _('Collecting data...'));
		this.nodes.log = E('textarea', {
			'class': 'cbi-input-textarea',
			readonly: 'readonly',
			style: 'width: 100% !important; height: 220px; margin-top: 10px; display: none;'
		});

		return E('div', { 'class': 'cbi-section' }, [
			E('div', { 'class': 'cbi-value-description firmware-info' }, [
				E('p', {}, [ _('Local Firmware Version') + ': ', this.state.localVersion || _('Unknown') ]),
				E('p', {}, [ _('Cloud Firmware Version') + ': ', this.nodes.cloud ]),
				this.nodes.release
			]),
			E('div', { style: 'margin-top: 12px;' }, [
				this.nodes.button,
				this.nodes.progress,
				this.nodes.progressText,
				this.nodes.log
			])
		]);
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
		return String(uci.get('easyupdate', 'main', 'mirror') || '') + url;
	},

	refreshRelease: function() {
		var repo = parseGithubRepo(uci.get('easyupdate', 'main', 'github') || DEFAULT_GITHUB);
		var self = this;

		this.setAction(null, _('Collecting data...'), true);
		this.setProgress(0, 0);
		this.appendLog(_('Checking cloud firmware version...'));

		if (!repo)
			return this.fail(_('Invalid GitHub repository URL'));

		return this.ensureTmpDir().then(function() {
			return self.curl('https://api.github.com/repos/' + repo.owner + '/' + repo.repo + '/releases/latest');
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

		if (uci.get('easyupdate', 'main', 'forceflash') === '1')
			args.push('-F');

		if (uci.get('easyupdate', 'main', 'keepconfig') !== '1')
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
