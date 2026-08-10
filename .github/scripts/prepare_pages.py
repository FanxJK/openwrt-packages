#!/usr/bin/env python3
"""Build the GitHub Pages site for the APK feed."""

import argparse
import html
import json
import shutil
from pathlib import Path

FEED_PATH = Path("immortalwrt/25.12/x86_64")
DISTRIBUTION = "ImmortalWrt"
RELEASE = "25.12"
ARCHITECTURE = "x86_64"
REPOSITORY_URL = "https://github.com/FanxJK/openwrt-packages"
FEED_URL = f"https://repo.rushb.pro/{FEED_PATH.as_posix()}"


def render_page(title: str, heading: str, intro: str, body: str) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>{html.escape(title)}</title>
  <style>
    :root {{ font-family: Inter, ui-sans-serif, system-ui, sans-serif; color-scheme: dark; }}
    body {{ margin: 0; background: #08111f; color: #e8eef8; }}
    main {{ width: min(920px, calc(100% - 40px)); margin: 64px auto; }}
    .eyebrow {{ color: #58d6b3; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }}
    h1 {{ margin: 12px 0; font-size: clamp(2rem, 7vw, 4.4rem); line-height: 1; }}
    .lead {{ max-width: 720px; color: #aebdd2; font-size: 1.08rem; line-height: 1.7; }}
    .card {{ margin-top: 28px; padding: 24px; border: 1px solid #26374e; border-radius: 18px; background: #0d192a; }}
    code {{ font-family: ui-monospace, SFMono-Regular, Consolas, monospace; overflow-wrap: anywhere; }}
    a {{ color: #72e7c6; }}
    ul {{ line-height: 1.75; }}
  </style>
</head>
<body>
<main>
  <div class="eyebrow">Fanx OpenWrt Packages</div>
  <h1>{html.escape(heading)}</h1>
  <p class="lead">{html.escape(intro)}</p>
  {body}
</main>
</body>
</html>
"""


def prepare(feed_dir: Path, output_dir: Path) -> None:
    package_files = sorted(feed_dir.glob("*.apk"))
    required_files = [feed_dir / name for name in ("packages.adb", "index.json", "public-key.pem")]

    if not package_files:
        raise ValueError(f"No APK packages found in {feed_dir}")
    for path in required_files:
        if not path.is_file():
            raise ValueError(f"Missing feed file: {path}")

    index = json.loads((feed_dir / "index.json").read_text(encoding="utf-8"))
    if index.get("version") != 2 or index.get("architecture") != ARCHITECTURE:
        raise ValueError("Invalid feed index")
    packages = index.get("packages")
    if not isinstance(packages, dict) or len(packages) != len(package_files):
        raise ValueError("Feed index does not match APK files")

    shutil.rmtree(output_dir, ignore_errors=True)
    published_feed = output_dir / FEED_PATH
    published_feed.mkdir(parents=True)

    for source in [*package_files, *required_files]:
        shutil.copy2(source, published_feed / source.name)

    package_items = "\n".join(
        f'      <li><a href="{html.escape(path.name)}">{html.escape(path.name)}</a></li>'
        for path in package_files
    )
    feed_body = f"""
  <section class="card">
    <h2>Packages ({len(package_files)})</h2>
    <ul>
{package_items}
    </ul>
    <p><a href="packages.adb">packages.adb</a> · <a href="public-key.pem">public-key.pem</a> · <a href="index.json">index.json</a></p>
  </section>
"""
    (published_feed / "index.html").write_text(
        render_page(
            "Fanx APK Feed",
            f"{DISTRIBUTION} {RELEASE} / {ARCHITECTURE}",
            "A signed APK package feed built by GitHub Actions.",
            feed_body,
        ),
        encoding="utf-8",
    )

    root_body = f"""
  <section class="card">
    <h2>Available feed</h2>
    <p><a href="{FEED_PATH.as_posix()}/">{DISTRIBUTION} {RELEASE} / {ARCHITECTURE}</a></p>
    <p>APK index: <code>{FEED_URL}/packages.adb</code></p>
  </section>
  <section class="card">
    <h2>Compatibility boundary</h2>
    <p>This binary feed is not compatible with OpenWrt 24.10, opkg-based firmware, other CPU architectures, or firmware with a mismatched kernel ABI.</p>
    <p><a href="{REPOSITORY_URL}">Source repository</a></p>
  </section>
"""
    (output_dir / "index.html").write_text(
        render_page(
            "Fanx OpenWrt Packages",
            "Signed APK package feed",
            "A versioned third-party package feed for ImmortalWrt.",
            root_body,
        ),
        encoding="utf-8",
    )

    print(f"Prepared {len(package_files)} packages at {published_feed}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--feed-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    prepare(args.feed_dir.resolve(), args.output_dir.resolve())
