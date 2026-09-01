"""Postgres access owned by the gateway: only the distribution-state tables
are ever written here. Reads against backend-owned tables (organization_
companies, organization_company_services) are select-only, mirroring how the
Go workers already query the shared schema directly (see
docs/architecture/22_nfe_gateway_service.md#fronteira-de-responsabilidade).
"""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg

from nfe_gateway.distribution_state import RATE_WINDOW, SAFE_CALLS_PER_WINDOW, CallWindow

# How long a claimed row stays "leased" before another poller tick could
# re-claim it if this process crashes mid-SEFAZ-call without ever reaching
# record_poll_result. Without this, claim_due_companies alone doesn't move
# next_allowed_poll_at, so the very next tick (as soon as
# DISTRIBUTION_POLL_TICK_SECONDS later) could re-claim the same row and fire
# a second SEFAZ call while the first is still in flight — exactly the kind
# of double-call that burns the 20/h budget for nothing. 5 minutes is
# generous slack over a normal SEFAZ round-trip.
CLAIM_LEASE_SECONDS = 300


def _as_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if isinstance(value, (bytes, bytearray)):
        return json.loads(value)
    if isinstance(value, str):
        return json.loads(value)
    return {}


@dataclass
class QueryRequestRow:
    id: UUID
    organization_id: UUID
    organization_company_id: UUID
    query_type: str
    params: dict[str, Any]


@dataclass
class ManifestationRequestRow:
    id: UUID
    organization_id: UUID
    organization_company_id: UUID
    pending_document_id: UUID
    chave: str
    company_cnpj: str  # the recipient's own CNPJ — who is manifesting, NOT
    # pending_document.cnpj_emitente (who issued the note being manifested).
    uf: str
    environment: str


@dataclass
class DueCompany:
    state_id: UUID
    organization_id: UUID
    organization_company_id: UUID
    environment: str
    uf: str
    cnpj: str
    last_nsu: int
    poll_interval_seconds: int
    version: int
    consecutive_empty_polls: int
    consecutive_errors: int
    window: CallWindow


class Database:
    def __init__(self, pool: asyncpg.Pool):
        self._pool = pool

    @classmethod
    async def connect(cls, dsn: str) -> "Database":
        pool = await asyncpg.create_pool(dsn, min_size=1, max_size=10)
        return cls(pool)

    @property
    def pool(self) -> asyncpg.Pool:
        """Exposed so callers that need their own tables on the same
        connection pool (e.g. CredentialsStore) don't have to open a second
        one — see workers/distribution_poller.py."""
        return self._pool

    async def close(self) -> None:
        await self._pool.close()

    @asynccontextmanager
    async def transaction(self):
        async with self._pool.acquire() as conn:
            async with conn.transaction():
                yield conn

    async def claim_due_companies(self, limit: int) -> list[DueCompany]:
        """SELECT ... FOR UPDATE SKIP LOCKED so multiple poller replicas never
        pick the same company/environment at once — this row lock IS the
        per-company SEFAZ serialization described in the architecture doc.
        Also leases the row (see CLAIM_LEASE_SECONDS) so a crash mid-poll
        can't get it double-claimed within the same tick cycle.

        uf/environment come from organization_companies, not from a copy on
        this table — they used to be duplicated here, which risked drifting
        out of sync if a company's registration was ever corrected after its
        distribution state row existed. organization_companies is the single
        source of truth for both (see migration 011).

        status in ('active', 'error') on purpose — 'error' is set after ANY
        failed poll (a transient network blip just as much as a real SEFAZ
        656), and decide_next_poll already computed a correct backoff into
        next_allowed_poll_at for exactly that case. Excluding 'error' here
        would make that backoff pointless: found live on 2026-08-16 — a
        company sat well past its next_allowed_poll_at for 30+ minutes doing
        nothing, because this filter used to be status = 'active' only.
        'paused' is the one status that means "leave this alone until a
        human re-activates it" and stays excluded.
        """
        async with self.transaction() as conn:
            rows = await conn.fetch(
                """
                select st.id, st.organization_id, st.organization_company_id,
                       oc.environment, oc.uf, oc.cnpj, st.last_nsu, st.poll_interval_seconds, st.version,
                       st.consecutive_empty_polls, st.consecutive_errors,
                       st.window_started_at, st.calls_in_window
                from organization_company_nfe_distribution_state st
                join organization_companies oc on oc.id = st.organization_company_id
                where st.status in ('active', 'error') and st.next_allowed_poll_at <= now()
                  and oc.uf is not null
                order by st.next_allowed_poll_at
                limit $1
                for update of st skip locked
                """,
                limit,
            )
            if rows:
                await conn.executemany(
                    f"update organization_company_nfe_distribution_state "
                    f"set last_poll_at = now(), "
                    f"next_allowed_poll_at = now() + interval '{CLAIM_LEASE_SECONDS} seconds' "
                    f"where id = $1",
                    [(r["id"],) for r in rows],
                )
            return [
                DueCompany(
                    state_id=r["id"],
                    organization_id=r["organization_id"],
                    organization_company_id=r["organization_company_id"],
                    environment=r["environment"],
                    uf=r["uf"],
                    cnpj=r["cnpj"],
                    last_nsu=r["last_nsu"],
                    poll_interval_seconds=r["poll_interval_seconds"],
                    version=r["version"],
                    consecutive_empty_polls=r["consecutive_empty_polls"],
                    consecutive_errors=r["consecutive_errors"],
                    window=CallWindow(started_at=r["window_started_at"], calls=r["calls_in_window"]),
                )
                for r in rows
            ]

    async def advance_nsu(self, state_id: UUID, last_nsu: int, max_nsu: int) -> None:
        """Called once per successfully-ingested document (see
        distribution_poller.py) so a crash mid-batch resumes at the exact NSU
        that still needs processing instead of losing or re-fetching everything.
        """
        await self._pool.execute(
            """
            update organization_company_nfe_distribution_state
            set last_nsu = $2, max_nsu = greatest(max_nsu, $3), updated_at = now(), version = version + 1
            where id = $1
            """,
            state_id,
            last_nsu,
            max_nsu,
        )

    async def record_poll_result(
        self,
        state_id: UUID,
        next_allowed_poll_at: datetime,
        consecutive_empty_polls: int,
        consecutive_errors: int,
        status: str,
        last_cstat: str | None,
        last_message: str | None,
        window: CallWindow,
    ) -> None:
        await self._pool.execute(
            """
            update organization_company_nfe_distribution_state
            set next_allowed_poll_at = $2,
                consecutive_empty_polls = $3,
                consecutive_errors = $4,
                status = $5::varchar(20),
                last_cstat = $6,
                last_message = $7,
                last_success_at = case when $5::varchar(20) = 'active' then now() else last_success_at end,
                window_started_at = $8,
                calls_in_window = $9,
                updated_at = now(),
                version = version + 1
            where id = $1
            """,
            state_id,
            next_allowed_poll_at,
            consecutive_empty_polls,
            consecutive_errors,
            status,
            last_cstat,
            last_message,
            window.started_at,
            window.calls,
        )

    async def insert_poll_log(
        self,
        organization_id: UUID,
        organization_company_id: UUID,
        requested_nsu: int,
        cstat: str | None,
        documents_found: int,
        outcome: str,
        error_message: str | None,
        started_at: datetime,
        finished_at: datetime,
        ult_nsu: int | None = None,
        max_nsu: int | None = None,
        xmotivo: str | None = None,
        documents_ingested: int = 0,
        documents_summary_only: int = 0,
    ) -> None:
        """One row per poll attempt, success or failure — this is the
        governance/audit trail an admin queries (GET .../nfe_distribution_polls
        in the backend): when it ran, what NSU was requested, what SEFAZ said
        (cstat/xmotivo/ult_nsu/max_nsu — max_nsu - ult_nsu is the remaining
        backlog), how many documents it found, and the outcome. ult_nsu/
        max_nsu/xmotivo are only present when a SEFAZ response was actually
        parsed (None on a signing-material or pre-SEFAZ failure — see
        workers/distribution_poller.py's three failure branches).
        documents_found can be > documents_ingested + documents_summary_only
        when ingestion fails partway through a batch — the remaining
        documents in that lote were never attempted this poll."""
        await self._pool.execute(
            """
            insert into organization_company_nfe_distribution_polls (
                id, organization_id, organization_company_id, requested_nsu, cstat,
                documents_found, outcome, error_message, started_at, finished_at,
                ult_nsu, max_nsu, xmotivo, documents_ingested, documents_summary_only
            ) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            """,
            organization_id,
            organization_company_id,
            requested_nsu,
            cstat,
            documents_found,
            outcome,
            error_message,
            started_at,
            finished_at,
            ult_nsu,
            max_nsu,
            xmotivo,
            documents_ingested,
            documents_summary_only,
        )

    async def upsert_pending_manifestation_document(
        self,
        organization_id: UUID,
        organization_company_id: UUID,
        chave: str,
        nsu: int,
        schema: str,
        cnpj_emitente: str | None,
        nome_emitente: str | None,
        valor: Decimal | None,
        data_emissao: datetime | None,
        protocolo: str | None,
        situacao: str | None,
    ) -> None:
        """Called from the skip branch in both distribution_poller.py and
        query_worker.py's _process_nsu whenever a non-procNFe doc (resNFe/
        resEvento/procEventoNFe) is seen — these have no <infNFe> so the
        backend's normal ingest endpoint always 422s on them (missing_company,
        confirmed live 2026-08-16/17). This is where that chave/summary data
        actually gets to live instead of being lost once the NSU cursor moves
        past it. Idempotent on (organization_company_id, chave) — a chave
        already 'manifested' or mid-'manifesting' is left alone by the WHERE
        guard on the update, so a re-seen resNFe (e.g. during a resync) can't
        clobber progress already made on it."""
        await self._pool.execute(
            """
            insert into nfe_pending_manifestation_documents (
                id, organization_id, organization_company_id, chave, nsu, schema,
                cnpj_emitente, nome_emitente, valor, data_emissao, protocolo, situacao
            ) values (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            on conflict (organization_company_id, chave) do update set
                nsu = excluded.nsu,
                schema = excluded.schema,
                cnpj_emitente = excluded.cnpj_emitente,
                nome_emitente = excluded.nome_emitente,
                valor = excluded.valor,
                data_emissao = excluded.data_emissao,
                protocolo = excluded.protocolo,
                situacao = excluded.situacao,
                updated_at = now()
            where nfe_pending_manifestation_documents.status = 'pending'
            """,
            organization_id,
            organization_company_id,
            chave,
            nsu,
            schema,
            cnpj_emitente,
            nome_emitente,
            valor,
            data_emissao,
            protocolo,
            situacao,
        )

    # ------------------------------------------------------------------
    # Manifestação (Ciência da Operação) — see workers/manifestation_worker.py.
    # Deliberately NOT sharing organization_company_nfe_distribution_state's
    # window/claim: RecepcaoEvento is a different SEFAZ webservice (batch
    # submission, not the distDFeInt query the 20/h ceiling was researched
    # against) and conflating the two would either block manifestation
    # behind an unrelated budget or silently assume a shared one that was
    # never confirmed. See sefaz/manifestation.py's module docstring.
    # ------------------------------------------------------------------

    async def claim_pending_manifestation_requests(self, limit: int = 20) -> list[ManifestationRequestRow]:
        async with self.transaction() as conn:
            rows = await conn.fetch(
                """
                select mr.id, mr.organization_id, mr.organization_company_id, mr.pending_document_id,
                       pd.chave, oc.cnpj as company_cnpj, oc.uf, oc.environment
                from nfe_manifestation_requests mr
                join nfe_pending_manifestation_documents pd on pd.id = mr.pending_document_id
                join organization_companies oc on oc.id = mr.organization_company_id
                where mr.status = 'pending'
                order by mr.created_at
                limit $1
                for update of mr skip locked
                """,
                limit,
            )
            if rows:
                await conn.executemany(
                    "update nfe_manifestation_requests set status = 'processing' where id = $1",
                    [(r["id"],) for r in rows],
                )
                await conn.executemany(
                    "update nfe_pending_manifestation_documents set status = 'manifesting', updated_at = now() where id = $1",
                    [(r["pending_document_id"],) for r in rows],
                )
            return [
                ManifestationRequestRow(
                    id=r["id"],
                    organization_id=r["organization_id"],
                    organization_company_id=r["organization_company_id"],
                    pending_document_id=r["pending_document_id"],
                    chave=r["chave"],
                    company_cnpj=r["company_cnpj"],
                    uf=r["uf"],
                    environment=r["environment"],
                )
                for r in rows
            ]

    async def complete_manifestation_request(
        self, request_id: UUID, pending_document_id: UUID, protocolo: str | None
    ) -> None:
        await self._pool.execute(
            "update nfe_manifestation_requests set status = 'completed', completed_at = now() where id = $1",
            request_id,
        )
        await self._pool.execute(
            """
            update nfe_pending_manifestation_documents
            set status = 'manifested', protocolo = coalesce($2, protocolo), manifested_at = now(), updated_at = now()
            where id = $1
            """,
            pending_document_id,
            protocolo,
        )

    async def fail_manifestation_request(
        self, request_id: UUID, pending_document_id: UUID, error_message: str
    ) -> None:
        await self._pool.execute(
            "update nfe_manifestation_requests set status = 'failed', error_message = $2, completed_at = now() where id = $1",
            request_id,
            error_message,
        )
        await self._pool.execute(
            """
            update nfe_pending_manifestation_documents
            set status = 'error', error_message = $2, updated_at = now()
            where id = $1
            """,
            pending_document_id,
            error_message,
        )

    # ------------------------------------------------------------------
    # On-demand queries (consulta por NSU/chave/lote) — see
    # workers/query_worker.py. claim_company_for_on_demand_call shares the
    # exact same organization_company_nfe_distribution_state row/window the
    # background poller above uses, so the two never together exceed
    # SEFAZ's real 20/h ceiling for a company.
    # ------------------------------------------------------------------

    async def ensure_distribution_state(self, organization_id: UUID, organization_company_id: UUID) -> None:
        """A company that never turned automatic distribution on has no
        rate-limit row. On-demand queries still need that window, otherwise
        claim_company_for_on_demand_call skips the request forever."""
        await self._pool.execute(
            """
            insert into organization_company_nfe_distribution_state (
                id, organization_id, organization_company_id,
                last_nsu, max_nsu, poll_interval_seconds, status,
                consecutive_empty_polls, consecutive_errors,
                next_allowed_poll_at, created_at, updated_at, version,
                window_started_at, calls_in_window
            ) values (
                gen_random_uuid(), $1, $2,
                0, 0, 3600, 'active',
                0, 0,
                now(), now(), now(), 1,
                now(), 0
            )
            on conflict (organization_company_id) do nothing
            """,
            organization_id,
            organization_company_id,
        )

    async def claim_company_for_on_demand_call(self, organization_company_id: UUID) -> DueCompany | None:
        """Same lease mechanism as claim_due_companies (CLAIM_LEASE_SECONDS),
        scoped to one specific company instead of "whatever's due". Returns
        None when the row is currently held by the poller (SKIP LOCKED), or
        the company isn't eligible to call SEFAZ right now — an active
        poller lease/backoff (next_allowed_poll_at in the future) or the
        rolling-hour budget already spent. The caller must leave its
        remaining work pending and let a later tick resume, exactly like the
        poller resumes a company at its own next_allowed_poll_at.
        """
        async with self.transaction() as conn:
            row = await conn.fetchrow(
                """
                select st.id, st.organization_id, st.organization_company_id,
                       oc.environment, oc.uf, oc.cnpj, st.last_nsu, st.poll_interval_seconds, st.version,
                       st.consecutive_empty_polls, st.consecutive_errors,
                       st.window_started_at, st.calls_in_window, st.next_allowed_poll_at
                from organization_company_nfe_distribution_state st
                join organization_companies oc on oc.id = st.organization_company_id
                where st.organization_company_id = $1 and st.status = 'active'
                for update of st skip locked
                """,
                organization_company_id,
            )
            if row is None:
                return None

            now = datetime.now(timezone.utc)
            if row["next_allowed_poll_at"] > now:
                return None

            window = CallWindow(started_at=row["window_started_at"], calls=row["calls_in_window"])
            if now - window.started_at >= RATE_WINDOW:
                window = CallWindow(started_at=now, calls=0)
            if window.calls >= SAFE_CALLS_PER_WINDOW:
                # Not leased, just out of budget until the window rolls over —
                # push next_allowed_poll_at out so this and the poller stop
                # re-checking the row every tick until it's actually usable.
                await conn.execute(
                    "update organization_company_nfe_distribution_state set next_allowed_poll_at = $2 where id = $1",
                    row["id"],
                    window.started_at + RATE_WINDOW,
                )
                return None

            await conn.execute(
                f"update organization_company_nfe_distribution_state "
                f"set next_allowed_poll_at = now() + interval '{CLAIM_LEASE_SECONDS} seconds' "
                f"where id = $1",
                row["id"],
            )
            return DueCompany(
                state_id=row["id"],
                organization_id=row["organization_id"],
                organization_company_id=row["organization_company_id"],
                environment=row["environment"],
                uf=row["uf"],
                cnpj=row["cnpj"],
                last_nsu=row["last_nsu"],
                poll_interval_seconds=row["poll_interval_seconds"],
                version=row["version"],
                consecutive_empty_polls=row["consecutive_empty_polls"],
                consecutive_errors=row["consecutive_errors"],
                window=window,
            )

    async def claim_pending_query_requests(self, limit: int) -> list[QueryRequestRow]:
        """FOR UPDATE SKIP LOCKED so multiple query_worker replicas never
        double-process the same request. Claims both brand-new ('pending')
        and partially-done ('processing' — resumed after an earlier tick ran
        out of rate-limit budget mid-batch) requests."""
        async with self.transaction() as conn:
            rows = await conn.fetch(
                """
                select id, organization_id, organization_company_id, query_type, params_json
                from fiscal_document_query_requests
                where status in ('pending', 'processing')
                order by created_at
                limit $1
                for update skip locked
                """,
                limit,
            )
            if rows:
                await conn.executemany(
                    "update fiscal_document_query_requests set status = 'processing' where id = $1",
                    [(r["id"],) for r in rows],
                )
            return [
                QueryRequestRow(
                    id=r["id"],
                    organization_id=r["organization_id"],
                    organization_company_id=r["organization_company_id"],
                    query_type=r["query_type"],
                    params=_as_dict(r["params_json"]),
                )
                for r in rows
            ]

    async def list_pending_query_items(self, query_request_id: UUID) -> list[dict[str, Any]]:
        rows = await self._pool.fetch(
            """
            select id, chave from fiscal_document_query_items
            where query_request_id = $1 and status = 'pending'
            order by chave
            """,
            query_request_id,
        )
        return [{"id": r["id"], "chave": r["chave"]} for r in rows]

    async def mark_query_item_result(
        self, item_id: UUID, status: str, document_id: UUID | None = None, error_message: str | None = None
    ) -> None:
        await self._pool.execute(
            """
            update fiscal_document_query_items
            set status = $2, document_id = $3, error_message = $4, resolved_at = now()
            where id = $1
            """,
            item_id,
            status,
            document_id,
            error_message,
        )

    async def update_query_request_progress(self, query_request_id: UUID, result_summary: dict[str, Any]) -> None:
        """Persists partial progress (e.g. the NSU cursor an on-demand scan
        has reached so far) without marking the request finished — read back
        on the next tick if a rate-limit budget runs out mid-scan."""
        await self._pool.execute(
            "update fiscal_document_query_requests set result_summary_json = $2::jsonb where id = $1",
            query_request_id,
            json.dumps(result_summary),
        )

    async def finish_query_request(self, query_request_id: UUID, status: str, result_summary: dict[str, Any]) -> None:
        await self._pool.execute(
            """
            update fiscal_document_query_requests
            set status = $2, result_summary_json = $3::jsonb, completed_at = now()
            where id = $1
            """,
            query_request_id,
            status,
            json.dumps(result_summary),
        )
