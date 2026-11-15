import argparse
import getpass
import sys

import uvicorn

from app.config import API_HOST, API_PORT


def create_owner(args):
    from fastapi import HTTPException
    from app.accounts import create_owner as create
    from app.db import init_db

    password = getpass.getpass("Password (at least 8 characters): ")
    if password != getpass.getpass("Repeat password: "):
        sys.exit("Passwords do not match.")
    init_db()
    try:
        user = create(args.username, password, args.display_name, args.academy_name, args.timezone)
    except (ValueError, HTTPException) as exc:
        sys.exit(f"Could not create owner: {getattr(exc, 'detail', exc)}")
    print(f"Created owner '{user['username']}'.")


def check_storage(_args):
    """Round-trip a tiny object with the same presigned URLs the app uses (local: the API must be running)."""
    from urllib.error import URLError
    from urllib.request import Request, urlopen
    from app import storage
    if not storage.enabled():
        sys.exit("R2 is selected but not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET in apps/api/.env.")
    key, body = "health-check/nadopasana.txt", b"ok"
    try:
        urlopen(Request(storage.upload_url(key, "text/plain"), data=body, method="PUT", headers={"Content-Type": "text/plain"}), timeout=15).close()
        with urlopen(storage.presign("GET", key, 60), timeout=15) as response: downloaded = response.read()
        found = storage.head(key)
        storage.delete(key)
    except URLError as exc:
        hint = " Start the API first (npm run api)." if storage.backend() == "local" else ""
        sys.exit(f"Storage check failed: {getattr(exc, 'reason', exc)}.{hint}")
    except Exception as exc:
        sys.exit(f"Storage check failed: {exc}")
    if found != (len(body), "text/plain") or downloaded != body:
        sys.exit(f"Storage check failed: unexpected object {found}")
    where = f"folder {storage.storage_root()}" if storage.backend() == "local" else "Cloudflare R2"
    print(f"Storage works ({storage.backend()}): uploaded, downloaded and deleted a test file in bucket '{storage.bucket()}' ({where}).")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the NadoPasana API, or manage it with a subcommand.")
    commands = parser.add_subparsers(dest="command")
    owner = commands.add_parser("create-owner", help="create an Owner account and the academy record")
    owner.add_argument("username")
    owner.add_argument("--display-name")
    owner.add_argument("--academy-name", default="NadoPasana")
    owner.add_argument("--timezone", default="Asia/Kolkata", help="IANA timezone, e.g. Asia/Kolkata")
    commands.add_parser("check-storage", help="check the Cloudflare R2 settings with a tiny upload")
    args = parser.parse_args()
    if args.command == "create-owner":
        create_owner(args)
    elif args.command == "check-storage":
        check_storage(args)
    else:
        uvicorn.run("app.main:app", host=API_HOST, port=API_PORT, reload=True)
