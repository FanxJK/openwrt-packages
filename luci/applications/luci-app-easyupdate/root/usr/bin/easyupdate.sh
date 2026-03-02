#!/bin/bash
# https://github.com/sundaqiang/openwrt-packages
# EasyUpdate for Openwrt

TMP_DIR="/tmp/easyupdate"
RELEASE_INFO_FILE="$TMP_DIR/release_info.json"
RELEASE_BODY_FILE="$TMP_DIR/release_body.txt"
MAIN_LOG_FILE="$TMP_DIR/main.log"
TRANSFER_LOG_FILE="$TMP_DIR/transfer.log"
FIRMWARE_MARKER_FILE="$TMP_DIR/firmware_filename"

function ensureTmpDir() {
	mkdir -p "$TMP_DIR"
}

function checkEnv() {
	if ! type sysupgrade >/dev/null 2>&1; then
		writeLog 'Your firmware does not contain sysupgrade and does not support automatic updates(您的固件未包含sysupgrade,暂不支持自动更新)'
		exit
	fi
}

function writeLog() {
	ensureTmpDir
	now_time='['$(date +"%Y-%m-%d %H:%M:%S")']'
	echo "${now_time} $1" | tee -a "$MAIN_LOG_FILE"
}

function shellHelp() {
	checkEnv
	cat <<EOH
Openwrt-EasyUpdate Script
Your firmware already includes Sysupgrade and supports automatic updates(您的固件已包含sysupgrade,支持自动更新)
参数:
    -c                         Get the cloud firmware version(获取云端固件版本)
    -i                         Get the cloud firmware release info(获取云端固件发布信息)
    -d                         Download cloud Firmware(下载云端固件)
    -x [check|download|all]    Clean temporary files(清理临时文件)
    -f filename                Flash firmware(刷写固件)
    -u                         One-click firmware update(一键更新固件)
EOH
}

function fetchReleaseData() {
	ensureTmpDir
	local need_fetch=0

	# 检查缓存文件是否存在或已超过10分钟
	if [ ! -f "$RELEASE_INFO_FILE" ] || [ $(( $(date +%s) - $(date -r "$RELEASE_INFO_FILE" +%s) )) -gt 600 ]; then
		need_fetch=1
	fi

	# 检查现有缓存是否包含API错误信息
	if [ -f "$RELEASE_INFO_FILE" ] && grep -q '"message":' "$RELEASE_INFO_FILE" 2>/dev/null; then
		need_fetch=1
	fi

	# 如果需要获取新数据
	if [ "$need_fetch" -eq 1 ]; then
		github=$(uci get easyupdate.main.github)
		github=(${github//// })
		curl -s "https://api.github.com/repos/${github[2]}/${github[3]}/releases/latest" > "$RELEASE_INFO_FILE"
	fi
}

function getCloudVer() {
	checkEnv
	fetchReleaseData
	cat "$RELEASE_INFO_FILE" | jsonfilter -e '@.tag_name'
}

function getReleaseInfo() {
	checkEnv
	fetchReleaseData

	# 检查是否存在API错误信息
	if grep -q '"message":' "$RELEASE_INFO_FILE" 2>/dev/null; then
		# 如果遇到API限制，使用message作为body内容
		local message=$(cat "$RELEASE_INFO_FILE" | jsonfilter -e '@.message' 2>/dev/null || echo "API访问受限")
		echo "$message" > "$RELEASE_BODY_FILE"
		echo "API Check Failed"
	else
		# 正常情况下获取版本号和body
		local version=$(cat "$RELEASE_INFO_FILE" | jsonfilter -e '@.tag_name')

		# 将body内容单独保存到文件中
		cat "$RELEASE_INFO_FILE" | jsonfilter -e '@.body' > "$RELEASE_BODY_FILE"

		# 只输出版本号
		echo "$version"
	fi
}

function downCloudVer() {
	checkEnv
	ensureTmpDir
	writeLog 'Get github project address(读取github项目地址)'
	github=$(uci get easyupdate.main.github)
	writeLog "Github project address(github项目地址):$github"
	github=(${github//// })
	writeLog 'Check whether EFI firmware is available(判断是否EFI固件)'
	if [ -d "/sys/firmware/efi/" ]; then
		suffix="combined-efi.img.gz"
	else
		suffix="combined.img.gz"
	fi
	writeLog "Whether EFI firmware is available(是否EFI固件):$suffix"
	writeLog 'Get the cloud firmware link(获取云端固件链接)'

	# 使用已获取的release信息
	fetchReleaseData
	url=$(cat "$RELEASE_INFO_FILE" | jsonfilter -e '@.assets[*].browser_download_url' | sed -n "/$suffix/p" | head -n 1)
	file_name=$(basename "$url")

	if [ -z "$url" ] || [ -z "$file_name" ] || [ "$file_name" = "." ]; then
		writeLog 'Cloud firmware link parse failed(云端固件链接解析失败)'
		return 1
	fi

	writeLog "Cloud firmware link(云端固件链接):$url"
	mirror=$(uci get easyupdate.main.mirror)
	writeLog "Use mirror URL(使用镜像网站):$mirror"
	echo "$file_name" > "$FIRMWARE_MARKER_FILE"

	curl -o "/tmp/${file_name}.sha256" -L "$mirror${url/$file_name/sha256sums}"
	curl -o "/tmp/${file_name}" -L "$mirror$url" >"$TRANSFER_LOG_FILE" 2>&1 &
	writeLog "Start downloading firmware, log output in $TRANSFER_LOG_FILE(开始下载固件)"
	echo "$file_name"
}

function flashFirmware() {
	checkEnv
	if [[ -z "$file" ]]; then
		writeLog 'Please specify the file name(请指定文件名)'
	else
		writeLog 'Get whether to save the configuration(读取是否保存配置)'
		keepconfig=$(uci get easyupdate.main.keepconfig)
		if [ $keepconfig -eq 1 ]; then
			keepconfig=' '
			res='yes'
		else
			keepconfig='-n '
			res='no'
		fi
		writeLog "Whether to save the configuration(读取是否保存配置):$res"
		writeLog "Start flash firmware, log output in $TRANSFER_LOG_FILE(开始刷写固件)"
		sysupgrade $keepconfig$file >"$TRANSFER_LOG_FILE" 2>&1 &
	fi
}

function checkSha() {
	if [[ -z "$file" ]] && [ -f "$FIRMWARE_MARKER_FILE" ]; then
		file=$(cat "$FIRMWARE_MARKER_FILE")
	fi

	if [[ -z "$file" ]]; then
		latest_file=$(ls -t /tmp/*.img.gz 2>/dev/null | head -n 1)
		if [[ -n "$latest_file" ]]; then
			file=$(basename "$latest_file")
		fi
	fi

	# 添加更详细的日志
	writeLog "Checking firmware integrity: $file"

	# 确保文件存在
	if [ ! -f "/tmp/$file" ]; then
		writeLog "Error: Firmware file not found: /tmp/$file"
		echo "ERROR: File not found"
		return 1
	fi

	# 确保SHA文件存在
	sha_file="/tmp/$file.sha256"
	if [ ! -f "$sha_file" ] && [ -f "/tmp/$file-sha256" ]; then
		sha_file="/tmp/$file-sha256"
	fi

	if [ ! -f "$sha_file" ]; then
		writeLog "Error: SHA256 file not found: $sha_file"
		echo "ERROR: SHA file not found"
		return 1
	fi

	# 先显示文件大小等信息
	writeLog "Firmware file size: $(du -h /tmp/$file | cut -f1)"

	# 输出SHA校验文件内容供调试
	sha_entry=$(grep "$file" "$sha_file" | head -n 1)
	writeLog "SHA256 file content: $sha_entry"
	if [ -z "$sha_entry" ]; then
		writeLog "Error: Cannot find checksum entry for $file"
		echo "ERROR: SHA entry not found"
		return 1
	fi

	# 执行校验
	check_out=$(cd /tmp && echo "$sha_entry" | sha256sum -c - 2>&1)
	result=$?
	writeLog "$check_out"

	if [ $result -eq 0 ]; then
		writeLog "Firmware integrity check: OK"
		echo "OK: $file"
		return 0
	else
		writeLog "Firmware integrity check: FAILED"
		echo "ERROR: Checksum mismatch"
		return 1
	fi
}

function cleanTempFiles() {
	local scope=${1:-all}
	local firmware_file=""
	ensureTmpDir

	if [ -f "$FIRMWARE_MARKER_FILE" ]; then
		firmware_file=$(cat "$FIRMWARE_MARKER_FILE")
	fi

	case "$scope" in
		check)
			rm -f "$RELEASE_INFO_FILE" "$RELEASE_BODY_FILE" /tmp/release_info.json /tmp/release_body.txt
			;;
		download)
			rm -f "$TRANSFER_LOG_FILE" "$MAIN_LOG_FILE" "$FIRMWARE_MARKER_FILE" \
				/tmp/easyupdate.log /tmp/easyupdatemain.log \
				/tmp/easyupdate_download.log /tmp/easyupdate_filename.txt \
				/tmp/easyupdate_check_request.txt /tmp/easyupdate_check_filename.txt
			;;
		all)
			rm -f "$RELEASE_INFO_FILE" "$RELEASE_BODY_FILE" "$TRANSFER_LOG_FILE" "$MAIN_LOG_FILE" "$FIRMWARE_MARKER_FILE" \
				/tmp/release_info.json /tmp/release_body.txt /tmp/easyupdate.log /tmp/easyupdatemain.log \
				/tmp/easyupdate_download.log /tmp/easyupdate_filename.txt /tmp/easyupdate_check_request.txt /tmp/easyupdate_check_filename.txt
			;;
		*)
			echo "ERROR: Unsupported cleanup scope"
			return 1
			;;
	esac

	if [ -n "$firmware_file" ] && { [ "$scope" = "download" ] || [ "$scope" = "all" ]; }; then
		rm -f "/tmp/$firmware_file" "/tmp/$firmware_file.sha256" "/tmp/$firmware_file-sha256"
	fi

	echo "OK"
}

function updateCloud() {
	checkEnv
	writeLog 'Get the local firmware version(获取本地固件版本)'
	lFirVer=$(cat /etc/openwrt_release | sed -n "s/DISTRIB_GITHUBVER='\(.*\)'/\1/p")
	writeLog "Local firmware version(本地固件版本):$lFirVer"
	writeLog 'Get the cloud firmware version(获取云端固件版本)'
	cFirVer=$(getCloudVer)
	writeLog "Cloud firmware version(云端固件版本):$cFirVer"
	if [[ $lFirVer =~ "rc" ]]; then
		lFirVer=$(date -d "$(echo $lFirVer | cut -d'-' -f3 | sed 's/\./-/g')" +%s)
	else
		lFirVer=$(date -d "$(echo $lFirVer | cut -d'-' -f2 | sed 's/\./-/g')" +%s)
	fi
	if [[ $cFirVer =~ "rc" ]]; then
		cFirVer=$(date -d "$(echo $cFirVer | cut -d'-' -f3 | sed 's/\./-/g')" +%s)
	else
		cFirVer=$(date -d "$(echo $cFirVer | cut -d'-' -f2 | sed 's/\./-/g')" +%s)
	fi
	if [ $cFirVer -gt $lFirVer ]; then
		writeLog 'Need to be updated(需要更新)'
		checkShaRet=$(checkSha)
		if [[ $checkShaRet =~ 'OK' ]]; then
			writeLog 'Check completes(检查完成)'
			file=${checkShaRet:0:-4}
			flashFirmware
		else
			downCloudVer
			i=0
			while [ $i -le 100 ]; do
				log=$(cat "$TRANSFER_LOG_FILE" 2>/dev/null)
				str='transfer closed'
				if [[ $log =~ $str ]]; then
					writeLog 'Download error(下载出错)'
					i=101
					break
				else
					str='Could not resolve host'
					if [[ $log =~ $str ]]; then
						writeLog 'Download error(下载出错)'
						i=101
						break
					else
						str='100\s.+M\s+100.+--:--:--'
						if [[ $log =~ $str ]]; then
							writeLog 'Download completes(下载完成)'
							i=100
							break
						else
							echo "$log" | sed -n '$p'
							if [[ $i -eq 99 ]]; then
								writeLog 'Download the timeout(下载超时)'
								break
							fi
						fi
					fi
				fi
				let i++
				sleep 3
			done
			if [[ $i -eq 100 ]]; then
				writeLog 'Prepare flash firmware(准备刷写固件)'
				checkShaRet=$(checkSha)
				if [[ $checkShaRet =~ 'OK' ]]; then
					writeLog 'Check completes(检查完成)'
					file=${checkShaRet:0:-4}
					flashFirmware
				else
					writeLog 'Check error(检查出错)'
				fi
			fi
		fi
	else
		writeLog "Is the latest(已是最新)"
	fi
}

if [[ -z "$1" ]]; then
	shellHelp
else
	case $1 in
	-c)
		getCloudVer
		;;
	-i)
		getReleaseInfo
		;;
	-d)
		downCloudVer
		;;
	-x)
		cleanTempFiles "$2"
		;;
	-f)
		file=$2
		flashFirmware
		;;
	-k)
		file=$2
		checkSha
		;;
	-u)
		updateCloud
		;;
	*)
		shellHelp
		;;
	esac
fi
