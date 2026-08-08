include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-timecontrol-native
PKG_VERSION:=0.1.3
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
PKG_MAINTAINER:=Minok

LUCI_TITLE:=Native firewall4 device time control
LUCI_DESCRIPTION:=Daemon-free LuCI device time control using native firewall4 traffic-rule time expressions.
LUCI_DEPENDS:=+luci-base +firewall4
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
