module("luci.controller.easyupdate", package.seeall)

function index()
	if not nixio.fs.access("/etc/config/easyupdate") then
		return
	end
	local c = luci.model.uci.cursor()
	local r = 0
	if not c:get("easyupdate", "main", "mirror") then
		r = 1
		c:set("easyupdate", "main", "mirror", "")
	end
	if not c:get("easyupdate", "main", "keepconfig") then
		r = 1
		c:set("easyupdate", "main", "keepconfig", "1")
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
	entry({"admin", "services", "easyupdate", "flash"}, call("flash")).leaf = true
end

function Split(str, delim, maxNb)
	-- Eliminate bad cases...
	if string.find(str, delim) == nil then
		return { str }
	end
	if maxNb == nil or maxNb < 1 then
		maxNb = 0    -- No limit
	end
	local result = {}
	local pat = "(.-)" .. delim .. "()"
	local nb = 0
	local lastPos
	for part, pos in string.gfind(str, pat) do
		nb = nb + 1
		result[nb] = part
		lastPos = pos
		if nb == maxNb then break end
	end
	-- Handle the last field
	if nb ~= maxNb then
		result[nb + 1] = string.sub(str, lastPos)
	end
	return result
end

function getver()
	local e = {}
	local fs = require "nixio.fs"
	
	-- 获取版本号
	e.newver = luci.sys.exec("/usr/bin/easyupdate.sh -i"):gsub("[\r\n]", "")
	
	-- 从文件中读取body内容
	if fs.access("/tmp/release_body.txt") then
		e.body = fs.readfile("/tmp/release_body.txt") or ""
	else
		e.body = ""
	end
	
	local year, month, day = string.match(e.newver, "%-(%d+)%.(%d+)%.(%d+)")
	if year and month and day then
		e.newverint = os.time({year = year, month = month, day = day, hour = 0, min = 0, sec = 0})
	else
		e.newverint = 0
	end
	
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function download()
	local e = {}
	local ret = luci.sys.exec("/usr/bin/easyupdate.sh -d")
	
	-- 添加日志记录
	nixio.fs.writefile("/tmp/easyupdate_download.log", ret)
	
	-- 尝试匹配文件名
	e.data = ret:match("openwrt.+%.img%.gz") or ret:match("immortalwrt.+%.img%.gz")
	
	-- 如果没有找到匹配的文件名，尝试查找/tmp目录下的img.gz文件
	if not e.data then
		local files = luci.sys.exec("ls -lt /tmp/*.img.gz 2>/dev/null | head -n 1")
		e.data = files:match("(%S+%.img%.gz)")
		if e.data then
			-- 如果找到了文件，截取文件名部分
			e.data = e.data:match("([^/]+)$")
		end
	end
	
	-- 记录找到的文件名
	if e.data then
		nixio.fs.writefile("/tmp/easyupdate_filename.txt", e.data)
	else
		nixio.fs.writefile("/tmp/easyupdate_filename.txt", "没有找到文件名，原始返回：" .. ret)
	end
	
	e.code = 1
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function getlog()
	local e = {}
	e.code = 1
	e.data = nixio.fs.readfile("/tmp/easyupdate.log")
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function check()
	local e = {}
	local f = luci.http.formvalue("file")
	
	-- 记录请求的文件名
	nixio.fs.writefile("/tmp/easyupdate_check_request.txt", f or "无文件名参数")
	
	-- 如果文件名无效，尝试获取已下载的文件名
	if not f or f == "" or f == "undefined" then
		-- 尝试从文件中读取之前保存的文件名
		if nixio.fs.access("/tmp/easyupdate_filename.txt") then
			f = nixio.fs.readfile("/tmp/easyupdate_filename.txt")
			f = f:gsub("[\r\n]", "")  -- 移除换行符
		end
		
		-- 如果仍然没有有效文件名，尝试在/tmp目录下查找最新的img.gz文件
		if not f or f == "" or f == "undefined" or f:match("^没有找到") then
			local files = luci.sys.exec("ls -lt /tmp/*.img.gz 2>/dev/null | head -n 1")
			f = files:match("(%S+%.img%.gz)")
			if f then
				f = f:match("([^/]+)$")  -- 截取文件名部分
			end
		end
	end
	
	-- 记录最终使用的文件名
	nixio.fs.writefile("/tmp/easyupdate_check_filename.txt", f or "仍然无法确定文件名")
	
	e.code = 1
	if f and f ~= "" and f ~= "undefined" then
		e.data = luci.sys.exec("/usr/bin/easyupdate.sh -k " .. f)
	else
		e.data = "ERROR: Invalid filename"
	end
	
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end

function flash()
	local e = {}
	local f = luci.http.formvalue("file")
	luci.sys.exec("/usr/bin/easyupdate.sh -f /tmp/" .. f)
	e.code = 1
	luci.http.prepare_content("application/json")
	luci.http.write_json(e)
end