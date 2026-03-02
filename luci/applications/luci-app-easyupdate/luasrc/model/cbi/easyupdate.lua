local pcall, dofile, _G = pcall, dofile, _G
pcall(dofile, "/etc/openwrt_release")
local fs = require "nixio.fs"

m = Map("easyupdate", translate("EasyUpdate"),
	translate("EasyUpdate supports one-click firmware upgrade.") ..
	[[<br />]] ..
	translate("Update may cause restart failure, please proceed with caution.") ..
	[[<br /><br /><a href="https://github.com/FanxJK/OpenWrt-x86_64-Actions" target="_blank">Powered by Fanx</a>]]
)

s = m:section(NamedSection, "main", "easyupdate")
s.anonymous = true

p = s:option(Value, "mirror", translate("Mirror Url"), translate("Once configured, the mirror URL will be used when accessing Github."))
p.default = ""

k = s:option(Flag, "keepconfig", translate("KEEP CONFIG"), translate("When selected, configuration is retained when firmware upgrade."))
k.default = 1
k.optional = false

f = s:option(Flag, "forceflash", translate("Preference Force Flashing"), translate("When selected, Preference Force Flashing while firmware upgrading."))
f.default = 0
f.optional = false

b = s:option(Button, "_upgrade", translate("Firmware Upgrade"))
b.template = "easyupdate/button"
b.versions = _G.DISTRIB_GITHUBVER or ""

local apply = luci.http.formvalue("cbi.apply")
if apply and apply ~= "" then
	local crontabs = fs.readfile("/etc/crontabs/root") or ""
	crontabs = crontabs:gsub('[%d%* ]+/usr/bin/easyupdate%.sh %-u # EasyUpdate\n', '')
	fs.writefile("/etc/crontabs/root", crontabs)
end

return m
