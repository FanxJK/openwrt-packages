# Fanx OpenWrt Packages

面向 OpenWrt / ImmortalWrt 的第三方源码 Feed，并提供版本化、签名的二进制 APK 软件源。

## 发布方式

GitHub Actions 使用 ImmortalWrt 25.12 x86_64 SDK 构建并生成 `packages.adb`。只有 `main` 分支的完整构建通过后，签名的软件源才会原子部署到 GitHub Pages；手动指定部分包的测试构建不会覆盖线上完整源。
