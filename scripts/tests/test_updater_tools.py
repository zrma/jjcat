from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
# Synthetic public-only Tauri signer values; no private key material is retained.
PUBLIC_KEY = (
    "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IDVGOURGMUZGNkY2NTlEOTY"
    "KUldTV25XVnYvL0dkWDZtOWVybG5zZVRJWHUxaFlhTXBKblk5VmFoemg0SmxzYUtTNjFnUWdPOUoK"
)
SIGNATURE = (
    "dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkK"
    "UlVTV25XVnYvL0dkWDloRkgwbExoc2cvMDNHM1NacjBKMkVkaDhDRDJhSEhpQ2dJSkh1"
    "ZHNobFJrVFp1TllRLzdCVDQ2K2NPMmp2UEcrZ1VUZ2xVd0J0SDdjK1J4QTdZbGdVPQp0"
    "cnVzdGVkIGNvbW1lbnQ6IHRpbWVzdGFtcDoxNzg1MzQ1OTQwCWZpbGU6cGF5bG9hZAp6"
    "L1d4S3RwclZhdEJnd3M5b2ZQVit0Q0tMaDJsWTI2NWJwVHJqR21wUnhieHlKV0xTdVgv"
    "OTh4S0w5S1IwQ2hzVWUwV090emovamdOYkdoQXRmallBQT09Cg=="
)


def run_tool(
    name: str,
    *arguments: str,
    environment: dict[str, str] | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[str]:
    env = os.environ.copy()
    env.update(environment or {})
    return subprocess.run(
        [sys.executable, str(ROOT / "scripts" / name), *arguments],
        cwd=ROOT,
        env=env,
        check=check,
        capture_output=True,
        text=True,
    )


class UpdaterToolTests(unittest.TestCase):
    def test_config_overlay_requires_https_or_explicit_loopback(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "updater.json"
            run_tool(
                "create-updater-config.py",
                "--public-key-env",
                "JJCAT_TEST_PUBLIC_KEY",
                "--version",
                "0.9.1",
                "--output",
                str(output),
                environment={"JJCAT_TEST_PUBLIC_KEY": PUBLIC_KEY},
            )
            config = json.loads(output.read_text(encoding="utf-8"))
            self.assertEqual(config["version"], "0.9.1")
            self.assertTrue(config["bundle"]["createUpdaterArtifacts"])
            self.assertNotIn(
                "dangerousInsecureTransportProtocol",
                config["plugins"]["updater"],
            )

            run_tool(
                "create-updater-config.py",
                "--public-key-env",
                "JJCAT_TEST_PUBLIC_KEY",
                "--endpoint",
                "http://127.0.0.1:41837/latest-beta.json",
                "--allow-insecure-localhost",
                "--output",
                str(output),
                environment={"JJCAT_TEST_PUBLIC_KEY": PUBLIC_KEY},
            )
            local_config = json.loads(output.read_text(encoding="utf-8"))
            self.assertTrue(
                local_config["plugins"]["updater"][
                    "dangerousInsecureTransportProtocol"
                ]
            )

            rejected = run_tool(
                "create-updater-config.py",
                "--public-key-env",
                "JJCAT_TEST_PUBLIC_KEY",
                "--endpoint",
                "http://example.com/latest-beta.json",
                "--allow-insecure-localhost",
                "--output",
                str(output),
                environment={"JJCAT_TEST_PUBLIC_KEY": PUBLIC_KEY},
                check=False,
            )
            self.assertNotEqual(rejected.returncode, 0)

    def test_manifest_matches_versioned_archive_and_platform_aliases(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            signature = root / "jjcat_0.9.1_aarch64.app.tar.gz.sig"
            signature.write_text(SIGNATURE + "\n", encoding="utf-8")
            archive = root / "jjcat_0.9.1_aarch64.app.tar.gz"
            archive.touch()
            manifest = root / "latest-beta.json"

            run_tool(
                "create-updater-manifest.py",
                "--version",
                "0.9.1",
                "--archive-name",
                archive.name,
                "--signature-file",
                str(signature),
                "--output",
                str(manifest),
            )
            run_tool(
                "verify-updater-manifest.py",
                "--manifest",
                str(manifest),
                "--version",
                "0.9.1",
                "--archive",
                str(archive),
                "--signature",
                str(signature),
            )

            payload = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(
                set(payload["platforms"]),
                {"darwin-aarch64", "darwin-aarch64-app"},
            )
            for entry in payload["platforms"].values():
                self.assertEqual(entry["signature"], SIGNATURE)
                self.assertEqual(
                    entry["url"],
                    "https://github.com/zrma/jjcat/releases/download/"
                    "v0.9.1/jjcat_0.9.1_aarch64.app.tar.gz",
                )

    def test_local_manifest_override_is_loopback_only(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            signature = root / "fixture.sig"
            signature.write_text(SIGNATURE + "\n", encoding="utf-8")
            manifest = root / "latest-beta.json"
            archive_name = "jjcat_0.9.1_aarch64.app.tar.gz"
            local_url = f"http://localhost:41837/{archive_name}"

            run_tool(
                "create-updater-manifest.py",
                "--version",
                "0.9.1",
                "--archive-name",
                archive_name,
                "--signature-file",
                str(signature),
                "--download-url",
                local_url,
                "--allow-insecure-localhost",
                "--output",
                str(manifest),
            )
            payload = json.loads(manifest.read_text(encoding="utf-8"))
            self.assertEqual(
                payload["platforms"]["darwin-aarch64"]["url"],
                local_url,
            )


if __name__ == "__main__":
    unittest.main()
