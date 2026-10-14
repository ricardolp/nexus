"""As tabelas JSON em ``src/**/data/`` precisam chegar à imagem.

O ``railway up`` lê ``.railwayignore`` com semântica de gitignore: um padrão
``data`` sem barra exclui *qualquer* pasta ``data`` — inclusive as de dentro
do pacote — e o gateway quebra em produção com FileNotFoundError.
"""

from __future__ import annotations

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
PACKAGE_DATA = sorted((ROOT / "src").rglob("data/*.json"))


def _patterns(name: str) -> list[str]:
    path = ROOT / name
    if not path.exists():
        return []
    lines = (ln.strip() for ln in path.read_text(encoding="utf-8").splitlines())
    return [ln for ln in lines if ln and not ln.startswith("#")]


def test_package_data_exists():
    names = {p.name for p in PACKAGE_DATA}
    assert {"ibge_tom.json", "cst_ibscbs.json", "cindop_rules.json"} <= names


@pytest.mark.parametrize("ignore_file", [".railwayignore", ".dockerignore"])
def test_ignore_files_keep_package_data(ignore_file):
    for pattern in _patterns(ignore_file):
        bare = pattern.rstrip("/")
        assert bare not in {"data", "*.json", "**/data"}, (
            f"{ignore_file}: '{pattern}' exclui {', '.join(str(p.relative_to(ROOT)) for p in PACKAGE_DATA)}; "
            "use '/data' para ignorar só a pasta da raiz"
        )


def test_package_data_not_gitignored():
    """``railway up`` também pula o que o .gitignore do repositório ignora."""
    import shutil
    import subprocess

    if not shutil.which("git") or not (ROOT.parent / ".git").exists():
        pytest.skip("fora de um checkout git")
    for path in PACKAGE_DATA:
        res = subprocess.run(
            ["git", "check-ignore", "-v", str(path)],
            check=False,
            cwd=ROOT.parent,
            capture_output=True,
            text=True,
        )
        assert res.returncode == 1, f"{path.relative_to(ROOT)} está no .gitignore: {res.stdout.strip()}"
