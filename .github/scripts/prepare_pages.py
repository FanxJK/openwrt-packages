#!/usr/bin/env python3
"""Assemble a validated GitHub Pages artifact for the APK feed."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

FEED_RELATIVE_PATH = Path("immortalwrt/25.12/x86_64")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def reset_directory(path: Path) -> None:
    if path.exists():
        if path.is_symlink() or not path.is_dir():
            raise ValueError(f"Output path is not a normal directory: {path}")
        shutil.rmtree(path)
    path.mkdir(parents=True)


def load_index(feed_dir: Path, architecture: str) -> dict[str, object]:
    index_path = feed_dir / "index.json"
    try:
        data = json.loads(index_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Invalid SDK index: {index_path}: {exc}") from exc

    if data.get("version") != 2:
        raise ValueError(f"Unexpected index version: {data.get('version')!r}")
    if data.get("architecture") != architecture:
        raise ValueError(
            f"Index architecture {data.get('architecture')!r} does not match {architecture!r}"
        )
    packages = data.get("packages")
    if not isinstance(packages, dict) or not packages:
        raise ValueError("SDK index contains no packages")
    if not all(
        isinstance(name, str) and isinstance(version, str)
        for name, version in packages.items()
    ):
        raise ValueError("SDK index has invalid package names or versions")
    return data


def render_page(
    *,
    title: str,
    heading: str,
    intro: str,
    body: str,
) -> str:
    return f"""<!doctype html>
<html lang="zh-CN">
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
    code, pre {{ font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }}
    code {{ overflow-wrap: anywhere; }}
    pre {{ overflow-x: auto; padding: 16px; border-radius: 12px; background: #050b14; line-height: 1.55; }}
    a {{ color: #72e7c6; }}
    ul {{ line-height: 1.75; }}
    .muted {{ color: #8293aa; }}
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


def prepare(args: argparse.Namespace) -> None:
    feed_dir = args.feed_dir.resolve()
    output_dir = args.output_dir.resolve()
    public_key = args.public_key.resolve()

    if not feed_dir.is_dir():
        raise ValueError(f"Feed directory does not exist: {feed_dir}")
    if not public_key.is_file() or public_key.is_symlink():
        raise ValueError(f"Public key is missing or unsafe: {public_key}")

    repository_index = feed_dir / "packages.adb"
    if not repository_index.is_file() or repository_index.is_symlink():
        raise ValueError(
            f"Signed package index is missing or unsafe: {repository_index}"
        )

    package_files = sorted(feed_dir.glob("*.apk"))
    if not package_files:
        raise ValueError(f"No APK packages found in {feed_dir}")
    if any(path.is_symlink() or not path.is_file() for path in package_files):
        raise ValueError("APK inputs must be regular files, not symbolic links")

    index = load_index(feed_dir, args.architecture)
    indexed_packages = index["packages"]
    assert isinstance(indexed_packages, dict)
    if len(indexed_packages) != len(package_files):
        raise ValueError(
            f"Index contains {len(indexed_packages)} packages but {len(package_files)} APK files exist"
        )

    reset_directory(output_dir)
    published_feed = output_dir / FEED_RELATIVE_PATH
    published_feed.mkdir(parents=True)

    for source in [repository_index, feed_dir / "index.json", *package_files]:
        shutil.copy2(source, published_feed / source.name, follow_symlinks=False)
    shutil.copy2(public_key, published_feed / "public-key.pem", follow_symlinks=False)

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    metadata = {
        "schema_version": 1,
        "distribution": args.distribution,
        "release": args.release,
        "architecture": args.architecture,
        "package_format": "apk",
        "repository_index": "packages.adb",
        "source_repository": args.source_repository,
        "source_commit": args.source_commit,
        "workflow_run_id": args.run_id,
        "generated_at": generated_at,
        "package_count": len(indexed_packages),
        "packages": dict(sorted(indexed_packages.items())),
    }
    (published_feed / "build-info.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    package_items = "\n".join(
        f'      <li><a href="{html.escape(path.name)}">{html.escape(path.name)}</a></li>'
        for path in package_files
    )
    feed_url = f"{args.pages_url.rstrip('/')}/{FEED_RELATIVE_PATH.as_posix()}"
    repository_url = f"{feed_url}/packages.adb"
    key_url = f"{feed_url}/public-key.pem"
    install_commands = "\n".join(
        [
            "mkdir -p /etc/apk/keys /etc/apk/repositories.d",
            f"wget -O /etc/apk/keys/fanxjk-openwrt-packages.pem {key_url}",
            f"printf '%s\\n' '{repository_url}' > /etc/apk/repositories.d/fanxjk-openwrt-packages.list",
            "apk update",
        ]
    )

    feed_body = f"""
  <section class="card">
    <h2>Repository endpoint</h2>
    <p><code>{html.escape(repository_url)}</code></p>
    <pre>{html.escape(install_commands)}</pre>
    <p class="muted">仅兼容 {html.escape(args.distribution)} {html.escape(args.release)} / {html.escape(args.architecture)}。不要跨固件版本或架构混用。</p>
  </section>
  <section class="card">
    <h2>Packages ({len(package_files)})</h2>
    <ul>
{package_items}
    </ul>
    <p><a href="packages.adb">packages.adb</a> · <a href="public-key.pem">public-key.pem</a> · <a href="SHA256SUMS">SHA256SUMS</a> · <a href="build-info.json">build-info.json</a></p>
  </section>
"""
    (published_feed / "index.html").write_text(
        render_page(
            title="Fanx APK Feed",
            heading=f"{args.distribution} {args.release} / {args.architecture}",
            intro="由 GitHub Actions 使用固定签名密钥构建，仅在完整构建成功后发布。",
            body=feed_body,
        ),
        encoding="utf-8",
    )

    checksum_lines = []
    for path in sorted(published_feed.iterdir(), key=lambda item: item.name):
        if path.name == "SHA256SUMS":
            continue
        if path.is_symlink() or not path.is_file():
            raise ValueError(f"Pages feed contains a non-regular file: {path}")
        checksum_lines.append(f"{sha256(path)}  {path.name}")
    (published_feed / "SHA256SUMS").write_text(
        "\n".join(checksum_lines) + "\n", encoding="utf-8"
    )

    root_body = f"""
  <section class="card">
    <h2>Available feed</h2>
    <p><a href="{FEED_RELATIVE_PATH.as_posix()}/">{html.escape(args.distribution)} {html.escape(args.release)} / {html.escape(args.architecture)}</a></p>
    <p>APK index: <code>{html.escape(repository_url)}</code></p>
  </section>
  <section class="card">
    <h2>Compatibility boundary</h2>
    <p>该二进制源不适用于 OpenWrt 24.10、opkg 固件、其他 CPU 架构，或内核 ABI 不匹配的固件。</p>
    <p><a href="https://github.com/{html.escape(args.source_repository)}">Source repository</a></p>
  </section>
"""
    (output_dir / "index.html").write_text(
        render_page(
            title="Fanx OpenWrt Packages",
            heading="Signed APK package feed",
            intro="面向 ImmortalWrt 的版本化第三方软件源。",
            body=root_body,
        ),
        encoding="utf-8",
    )

    for path in output_dir.rglob("*"):
        if path.is_symlink():
            raise ValueError(f"Pages artifact must not contain symbolic links: {path}")

    print(f"Prepared {len(package_files)} packages at {published_feed}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--feed-dir", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--public-key", required=True, type=Path)
    parser.add_argument("--distribution", default="ImmortalWrt")
    parser.add_argument("--release", default="25.12")
    parser.add_argument("--architecture", default="x86_64")
    parser.add_argument("--pages-url", required=True)
    parser.add_argument("--source-repository", required=True)
    parser.add_argument("--source-commit", required=True)
    parser.add_argument("--run-id", required=True)
    return parser.parse_args()


if __name__ == "__main__":
    prepare(parse_args())
