"""One-time-per-organization provisioning step.

Usage:
    1. Create the technical client (an admin, via the control_plane_api —
       not something this script does):

       POST /v1/organizations/{organization_id}/api_clients
       {"name": "nfe-gateway distribution", "source_system": "nfe_gateway_distribution",
        "scopes": ["fiscal_documents:inbound:create"]}

       The response's "client_secret" is shown exactly once — copy it now.

    2. Hand it to this service (prompts for the secret — never pass it as a
       CLI argument: argv is visible to every other process on the host via
       `ps`/Task Manager, and bash/PowerShell both persist it to shell
       history by default):

       python -m nfe_gateway.provision_credentials \\
           --organization-id <uuid> --client-id <client_id>

    Or non-interactively (CI/automation), pipe it via stdin instead of argv:

       echo "$CLIENT_SECRET" | python -m nfe_gateway.provision_credentials \\
           --organization-id <uuid> --client-id <client_id> --stdin

See credentials.py's module docstring for why this can't be automated
end-to-end: the backend never re-exposes a client_secret after creation.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import sys
from uuid import UUID

import asyncpg

from nfe_gateway.config import load_settings
from nfe_gateway.credentials import CredentialsStore


async def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--organization-id", required=True, type=str)
    parser.add_argument("--client-id", required=True, type=str)
    parser.add_argument(
        "--stdin",
        action="store_true",
        help="read the client secret from stdin instead of prompting (for scripted/CI use)",
    )
    args = parser.parse_args()

    client_secret = sys.stdin.readline().rstrip("\n") if args.stdin else getpass.getpass("client_secret: ")
    if not client_secret:
        parser.error("client secret must not be empty")

    settings = load_settings()
    pool = await asyncpg.create_pool(settings.database_url, min_size=1, max_size=2)
    try:
        store = CredentialsStore(pool, settings.nfe_gateway_credentials_key)
        await store.put(UUID(args.organization_id), args.client_id, client_secret)
        print(f"stored credentials for organization {args.organization_id}")
    finally:
        await pool.close()


if __name__ == "__main__":
    asyncio.run(main())
