include $(TOPDIR)/rules.mk

PKG_VERSION:=1.1.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Fanx

LUCI_TITLE:=LuCI support for SLAAC DNS synchronization
LUCI_DESCRIPTION:=Publish local AAAA records by correlating LuCI host hints with SLAAC/NDP neighbors
LUCI_DEPENDS:=+luci-base +rpcd-mod-luci +ucode +ucode-mod-log
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
