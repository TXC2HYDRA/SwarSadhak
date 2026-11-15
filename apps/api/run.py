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


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the NadoPasana API, or manage it with a subcommand.")
    commands = parser.add_subparsers(dest="command")
    owner = commands.add_parser("create-owner", help="create an Owner account and the academy record")
    owner.add_argument("username")
    owner.add_argument("--display-name")
    owner.add_argument("--academy-name", default="NadoPasana")
    owner.add_argument("--timezone", default="Asia/Kolkata", help="IANA timezone, e.g. Asia/Kolkata")
    args = parser.parse_args()
    if args.command == "create-owner":
        create_owner(args)
    else:
        uvicorn.run("app.main:app", host=API_HOST, port=API_PORT, reload=True)
