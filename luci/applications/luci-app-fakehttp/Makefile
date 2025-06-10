include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-fakehttp
PKG_VERSION:=1.0

LUCI_TITLE:=LuCI support for FakeHTTP
LUCI_DEPENDS:=+fakehttp
LUCI_PKGARCH:=all

define Package/luci-app-fakehttp
  SECTION:=LuCI
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=$(LUCI_TITLE)
  DEPENDS:=$(LUCI_DEPENDS)
endef

define Package/luci-app-fakehttp/description
  LuCI interface for FakeHTTP.
endef

include $(TOPDIR)/feeds/luci/luci.mk
