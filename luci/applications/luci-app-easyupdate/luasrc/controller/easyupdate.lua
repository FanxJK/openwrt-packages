module("luci.controller.easyupdate", package.seeall)

local fs = require "nixio.fs"
local sys = require "luci.sys"
local http = require "luci.http"
local util = require "luci.util"

local TMP_DIR = "/tmp/easyupdate"
local RELEASE_BODY_FILE = TMP_DIR .. "/release_body.txt"
local LEGACY_RELEASE_BODY_FILE = "/tmp/release_body.txt"
local TRANSFER_LOG_FILE = TMP_DIR .. "/transfer.log"
local LEGACY_TRANSFER_LOG_FILE = "/tmp/easyupdate.log"
local FIRMWARE_MARKER_FILE = TMP_DIR .. "/firmware_filename"
local LEGACY_FIRMWARE_MARKER_FILE = "/tmp/easyupdate_filename.txt"

local function normalize_filename(name)
	if not name then
		return nil
	end

	name = name:gsub("[\r\n]", "")
	name = name:gsub("^%s+", ""):gsub("%s+$", "")
	if name == "" or name == "undefined" or name:match("^没有找到") then
		return nil
	end

	return name:match("([%w%._%-]+%.img%.gz)$")
end

local function read_first_existing(paths)
	for _, path in ipairs(paths) do
		if fs.access(path) then
			return fs.readfile(path) or ""
		end
	end
	return ""
end

local function get_latest_image_name()
	local files = sys.exec("ls -t /tmp/immortalwrt*.img.gz /tmp/openwrt*.img.gz 2>/dev/null | head -n 1")
	local filepath = files:match("(%S+%.img%.gz)")
	if filepath then
		return filepath:match("([^/]+)$")
	end
	return nil
end

local function get_saved_firmware_name()
	local name = normalize_filename(read_first_existing({FIRMWARE_MARKER_FILE, LEGACY_FIRMWARE_MARKER_FILE}))
	if name then
		return name
	end
	return get_latest_image_name()
end

function index()
	if not fs.access("/etc/config/easyupdate") then
		return
	end

	local c = luci.model.uci.cursor()
	local r = 0
	if not c:get("easyupdate", "main") then
		r = 1
		c:section("easyupdate", "easyupdate", "main")
	end
	if not c:get("easyupdate", "main", "mirror") then
		r = 1
		c:set("easyupdate", "main", "mirror", "")
	end
	if not c:get("easyupdate", "main", "keepconfig") then
		r = 1
		c:set("easyupdate", "main", "keepconfig", "1")
	end
	if not c:get("easyupdate", "main", "forceflash") then
		r = 1
		c:set("easyupdate", "main", "forceflash", "0")
	end
	if not c:get("easyupdate", "main", "github") then
		r = 1
		c:set("easyupdate", "main", "github", "https://github.com/FanxJK/OpenWrt-x86_64-Actions")
	end
	if r then
		c:commit("easyupdate")
	end

	entry({"admin", "services", "easyupdate"}, cbi("easyupdate"), _("EasyUpdate"), 99).dependent = true
	entry({"admin", "services", "easyupdate", "getver"}, call("getver")).leaf = true
	entry({"admin", "services", "easyupdate", "download"}, call("download")).leaf = true
	entry({"admin", "services", "easyupdate", "getlog"}, call("getlog")).leaf = true
	entry({"admin", "services", "easyupdate", "check"}, call("check")).leaf = true
	entry({"admin", "services", "easyupdate", "cleanup"}, call("cleanup")).leaf = true
	entry({"admin", "services", "easyupdate", "flash"}, call("flash")).leaf = true
end

function getver()
	local e = {}

	e.newver = sys.exec("/usr/bin/easyupdate.sh -i"):gsub("[\r\n]", "")
	e.body = read_first_existing({RELEASE_BODY_FILE, LEGACY_RELEASE_BODY_FILE})

	local year, month, day = string.match(e.newver, "%-(%d+)%.(%d+)%.(%d+)")
	if year and month and day then
		e.newverint = os.time({year = year, month = month, day = day, hour = 0, min = 0, sec = 0})
	else
		e.newverint = 0
	end

	http.prepare_content("application/json")
	http.write_json(e)
end

function download()
	local e = {}
	local ret = sys.exec("/usr/bin/easyupdate.sh -d")

	local tail = normalize_filename(ret:match("([^\r\n]+)%s*$"))
	if tail and tail:match("%.img%.gz$") then
		e.data = tail
	end

	if not e.data then
		e.data = get_saved_firmware_name()
	end

	if not e.data then
		e.data = normalize_filename(ret:match("(openwrt[%w%._%-]*%.img%.gz)") or ret:match("(immortalwrt[%w%._%-]*%.img%.gz)"))
	end

	e.code = 1
	http.prepare_content("application/json")
	http.write_json(e)
end

function getlog()
	local e = {}
	e.code = 1
	e.data = read_first_existing({TRANSFER_LOG_FILE, LEGACY_TRANSFER_LOG_FILE})
	http.prepare_content("application/json")
	http.write_json(e)
end

function check()
	local e = {}
	local f = normalize_filename(http.formvalue("file"))

	if not f then
		f = get_saved_firmware_name()
	end

	e.code = 1
	if f then
		e.data = sys.exec("/usr/bin/easyupdate.sh -k " .. util.shellquote(f))
		e.file = normalize_filename(e.data:match("OK:%s*([^\r\n]+)")) or f
	else
		e.data = "ERROR: Invalid filename"
	end

	http.prepare_content("application/json")
	http.write_json(e)
end

function cleanup()
	local e = {}
	local scope = http.formvalue("scope")

	if scope ~= "check" and scope ~= "download" and scope ~= "all" then
		scope = "all"
	end

	e.data = sys.exec("/usr/bin/easyupdate.sh -x " .. util.shellquote(scope))
	e.code = e.data:match("ERROR:") and 0 or 1

	http.prepare_content("application/json")
	http.write_json(e)
end

function flash()
	local e = {}
	local f = normalize_filename(http.formvalue("file"))

	if f then
		sys.exec("/usr/bin/easyupdate.sh -f " .. util.shellquote("/tmp/" .. f))
		e.code = 1
	else
		e.code = 0
		e.data = "ERROR: Invalid filename"
	end

	http.prepare_content("application/json")
	http.write_json(e)
end
