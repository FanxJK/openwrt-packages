include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-fakehttp
PKG_VERSION:=1.0
PKG_RELEASE:=1

LUCI_TITLE:=LuCI support for FakeHTTP
LUCI_DEPENDS:=+fakehttp
LUCI_PKGARCH:=all

define Package/$(PKG_NAME)/description
  LuCI interface for FakeHTTP.
endef

include $(TOPDIR)/feeds/luci/luci.mk