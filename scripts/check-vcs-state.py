#!/usr/bin/env python3
"""기존 VCS 검사 명령을 pin한 공통 runtime으로 전달한다."""
from pathlib import Path
import runpy

if __name__ == "__main__":
    runpy.run_path(str(Path(__file__).resolve().parents[1] / ".ai-first/vcs.py"), run_name="__main__")
