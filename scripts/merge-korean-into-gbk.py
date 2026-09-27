#!/usr/bin/env python3
"""Merge Korean resource paths into the GBK-mojibake paths used by the client.

The client publishes Korean names as:

    Korean Unicode -> EUC-KR bytes -> GBK Unicode

This script works in place. It does not create a staging directory. The default
mode is a dry run; pass --apply to move files and remove the old Korean paths.
For file conflicts, the larger file wins. Equal-size conflicts keep the current
GBK destination. Directory conflicts are merged recursively.
"""

from __future__ import annotations

import argparse
import os
import sys
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Entry:
    source: Path
    destination: Path
    is_dir: bool
    size: int | None = None


def has_hangul(value: str) -> bool:
    return any("\u1100" <= character <= "\u11ff"
               or "\u3130" <= character <= "\u318f"
               or "\ua960" <= character <= "\ua97f"
               or "\uac00" <= character <= "\ud7ff" for character in value)


def convert_segment(segment: str) -> str:
    if not has_hangul(segment):
        return segment
    try:
        return segment.encode("euc_kr").decode("gbk")
    except UnicodeError as error:
        raise ValueError(f"cannot transcode path segment {segment!r}: {error}") from error


def convert_relative(relative: Path) -> Path:
    return Path(*(convert_segment(part) for part in relative.parts))


def validate_root(root: Path) -> Path:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f"root is not a directory: {root}")
    if root == Path(root.anchor):
        raise ValueError("refusing to process a filesystem root")
    return root


def scan(root: Path) -> tuple[list[Entry], list[str]]:
    entries: list[Entry] = []
    errors: list[str] = []
    seen_destinations: dict[Path, Path] = {}

    for current, dirnames, filenames in os.walk(root, topdown=True, followlinks=False):
        current_path = Path(current)
        dirnames.sort()
        filenames.sort()

        kept_dirs: list[str] = []
        for name in dirnames:
            source = current_path / name
            try:
                if source.is_symlink():
                    errors.append(f"symlink directory is not supported: {source}")
                    continue
                relative = source.relative_to(root)
                destination = root / convert_relative(relative)
                if destination != source:
                    entry = Entry(source, destination, True)
                    previous = seen_destinations.get(destination)
                    if previous:
                        errors.append(f"two source paths map to {destination}: {previous} and {source}")
                    seen_destinations[destination] = source
                    entries.append(entry)
                kept_dirs.append(name)
            except (OSError, ValueError, UnicodeError) as error:
                errors.append(f"cannot inspect directory {source}: {error}")
        dirnames[:] = kept_dirs

        for name in filenames:
            source = current_path / name
            try:
                if source.is_symlink():
                    errors.append(f"symlink file is not supported: {source}")
                    continue
                if not source.is_file():
                    errors.append(f"special file is not supported: {source}")
                    continue
                relative = source.relative_to(root)
                destination = root / convert_relative(relative)
                if destination == source:
                    continue
                entry = Entry(source, destination, False, source.stat().st_size)
                previous = seen_destinations.get(destination)
                if previous:
                    errors.append(f"two source paths map to {destination}: {previous} and {source}")
                seen_destinations[destination] = source
                entries.append(entry)
            except (OSError, ValueError, UnicodeError) as error:
                errors.append(f"cannot inspect file {source}: {error}")

    return entries, errors


def describe_conflict(entry: Entry) -> str:
    destination = entry.destination
    if not destination.exists() and not destination.is_symlink():
        return "move"
    if entry.is_dir:
        if destination.is_dir() and not destination.is_symlink():
            return "merge directory"
        return "ERROR: source directory conflicts with non-directory"
    if destination.is_dir() or destination.is_symlink() and not destination.is_file():
        return "ERROR: source file conflicts with non-file"
    destination_size = destination.stat().st_size
    if entry.size is not None and entry.size > destination_size:
        return f"replace smaller destination ({destination_size} -> {entry.size} bytes)"
    return f"remove source; keep destination ({destination_size} >= {entry.size} bytes)"


def print_plan(entries: list[Entry], errors: list[str], root: Path, verbose: bool) -> None:
    print(f"Root: {root}")
    print(f"Entries to merge: {len(entries)}")
    print(f"Validation errors: {len(errors)}")
    if verbose:
        for entry in entries:
            print(f"{describe_conflict(entry):52} {entry.source} -> {entry.destination}")
    else:
        print("Use --print-plan to show every source -> destination mapping.")
    for error in errors[:20]:
        print(f"ERROR: {error}", file=sys.stderr)
    if len(errors) > 20:
        print(f"ERROR: ... and {len(errors) - 20} more errors", file=sys.stderr)


def move_file(entry: Entry) -> None:
    destination = entry.destination
    destination.parent.mkdir(parents=True, exist_ok=True)
    if not destination.exists() and not destination.is_symlink():
        os.replace(entry.source, destination)
        return
    if destination.is_dir() or destination.is_symlink() and not destination.is_file():
        raise RuntimeError(f"file destination is not a regular file: {destination}")
    destination_size = destination.stat().st_size
    source_size = entry.source.stat().st_size
    if source_size > destination_size:
        os.replace(entry.source, destination)
    else:
        entry.source.unlink()


def merge_directory(entry: Entry) -> None:
    source = entry.source
    destination = entry.destination
    if not source.exists():
        return
    if not destination.exists() and not destination.is_symlink():
        destination.parent.mkdir(parents=True, exist_ok=True)
        os.replace(source, destination)
        return
    if not destination.is_dir() or destination.is_symlink():
        raise RuntimeError(f"directory destination is not a directory: {destination}")
    try:
        source.rmdir()
    except OSError as error:
        raise RuntimeError(f"source directory is not empty after file merge: {source}: {error}") from error


def apply_entries(entries: list[Entry]) -> None:
    # Files first, deepest paths first. This empties Korean directories before
    # directory merge/removal and avoids moving a parent before its children.
    files = sorted((entry for entry in entries if not entry.is_dir), key=lambda item: len(item.source.parts), reverse=True)
    directories = sorted((entry for entry in entries if entry.is_dir), key=lambda item: len(item.source.parts), reverse=True)
    for index, entry in enumerate(files, 1):
        move_file(entry)
        if index % 1000 == 0 or index == len(files):
            print(f"files: {index}/{len(files)}", flush=True)
    for index, entry in enumerate(directories, 1):
        merge_directory(entry)
        if index % 1000 == 0 or index == len(directories):
            print(f"directories: {index}/{len(directories)}", flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, help="Directory to merge in place, for example vendor/core")
    parser.add_argument("--apply", action="store_true", help="Actually move files and remove old Korean paths")
    parser.add_argument("--print-plan", action="store_true", help="Print every planned operation")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        root = validate_root(Path(args.root))
        entries, errors = scan(root)
        print_plan(entries, errors, root, args.print_plan)
        if errors:
            print("Refusing to modify the tree while validation errors exist.", file=sys.stderr)
            return 2
        if not args.apply:
            print("Dry run only. Re-run with --apply after reviewing the plan.")
            return 0
        apply_entries(entries)
        print("Merge completed.")
        return 0
    except (OSError, RuntimeError, ValueError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
