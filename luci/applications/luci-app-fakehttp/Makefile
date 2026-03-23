include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for FakeHTTP
LUCI_DESCRIPTION:=Obfuscate all your TCP connections into HTTP protocol, using Netfilter Queue (NFQUEUE).
LUCI_DEPENDS:=+fakehttp +rpcd-mod-file
LUCI_PKGARCH:=all

PKG_VERSION:=2.1
PKG_RELEASE:=1

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
