include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI support for FakeSIP
LUCI_DESCRIPTION:=Disguise your UDP traffic as SIP protocol to evade DPI detection, using Netfilter Queue (NFQUEUE).
LUCI_DEPENDS:=+fakesip +rpcd-mod-file
LUCI_PKGARCH:=all

PKG_VERSION:=2.1
PKG_RELEASE:=1

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
