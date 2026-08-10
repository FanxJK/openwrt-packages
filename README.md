# Fanx OpenWrt Packages

面向 OpenWrt / ImmortalWrt 的第三方源码 Feed，并提供版本化、签名的二进制 APK 软件源。

## 源码 Feed

可在 OpenWrt / ImmortalWrt 编译树中加入：

```sh
echo 'src-git fanx https://github.com/FanxJK/openwrt-packages.git' >> feeds.conf.default
./scripts/feeds update fanx
./scripts/feeds install -a -p fanx
```

## 二进制 APK 软件源

当前仅发布：

- 发行版：ImmortalWrt 25.12
- 架构：x86_64
- 包格式：APK
- 在线源：https://fanxjk.github.io/openwrt-packages/

在兼容固件中添加公钥和软件源：

```sh
mkdir -p /etc/apk/keys /etc/apk/repositories.d
wget -O /etc/apk/keys/fanxjk-openwrt-packages.pem \
  https://fanxjk.github.io/openwrt-packages/immortalwrt/25.12/x86_64/public-key.pem
printf '%s\n' \
  'https://fanxjk.github.io/openwrt-packages/immortalwrt/25.12/x86_64/packages.adb' \
  > /etc/apk/repositories.d/fanxjk-openwrt-packages.list
apk update
```

随后按需安装包，例如：

```sh
apk add luci-app-timecontrol-native
```

> 不要在 OpenWrt 24.10、opkg 固件、其他 CPU 架构或内核 ABI 不匹配的固件上使用该二进制源，也不要用 `apk upgrade` 做整机固件升级。

## 发布方式

GitHub Actions 使用 ImmortalWrt 25.12 x86_64 SDK 构建并生成 `packages.adb`。只有 `main` 分支的完整构建通过后，签名的软件源才会原子部署到 GitHub Pages；手动指定部分包的测试构建不会覆盖线上完整源。
