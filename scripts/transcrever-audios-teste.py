"""
PROVA LOCAL DE `transcrever-audios.py` — sem modelo, sem GPU, sem rede.

    python scripts/transcrever-audios-teste.py

Roda o `main()` de verdade contra um banco e um Storage de mentira (em
memória). Nada sai da máquina: `urlopen` e `baixar` são trocados por falsos,
e o Whisper, o soundfile e o scipy por módulos vazios — dá para rodar com
qualquer Python 3.10+, sem instalar nada.

O cenário é o de 27/11/2026: um download devolve `HTTPError 403` no meio da
rodada. Antes da correção o script morria com traceback; agora o laço segue,
conta a falha e não grava nada para aquele áudio.

Para ver a versão antiga cair no mesmo cenário:

    git show <commit-antigo>:scripts/transcrever-audios.py > %TEMP%\\antigo.py
    set TRANSCREVER_SCRIPT=%TEMP%\\antigo.py && python scripts/transcrever-audios-teste.py
"""
import contextlib
import importlib.util
import io
import json
import os
import sys
import tempfile
import threading
import types
import unittest
import urllib.error
import urllib.parse
from unittest import mock

AQUI = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.environ.get("TRANSCREVER_SCRIPT") or os.path.join(AQUI, "transcrever-audios.py")
BASE = "https://falso.supabase.co"


def carregar_script():
    """Importa o script com Whisper/soundfile/scipy de mentira."""
    fw = types.ModuleType("faster_whisper")

    class Seg:
        def __init__(self, text):
            self.text = text

    class WhisperModel:
        def __init__(self, *a, **k):
            pass

        def transcribe(self, audio, **k):
            return [Seg("quanto fica o iPhone 15 na troca?")], None

    fw.WhisperModel = WhisperModel
    sf = types.ModuleType("soundfile")
    sf.read = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("soundfile falso"))
    scipy = types.ModuleType("scipy")
    signal = types.ModuleType("scipy.signal")
    signal.resample_poly = lambda x, *a, **k: x
    scipy.signal = signal
    falsos = {"faster_whisper": fw, "soundfile": sf, "scipy": scipy, "scipy.signal": signal}
    with mock.patch.dict(sys.modules, falsos):
        spec = importlib.util.spec_from_file_location("transcrever_audios", SCRIPT)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
    return mod


class Resposta(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.close()


class Mundo:
    """Banco (`mensagens`) e Storage falsos, com o comportamento de cada id."""

    def __init__(self, ids):
        self.linhas = {
            i: {"id": i, "transcricao": None,
                "midia_url": f"{BASE}/storage/v1/object/public/chat-midia/emp1/a{i}.ogg"}
            for i in ids
        }
        self.patches = []          # (id, corpo) de cada PATCH em mensagens
        self.apagados_storage = []  # prefixos apagados no Storage
        self.downloads = {}        # id -> tentativas
        self.trava = threading.Lock()

    # ── REST + Storage (DELETE) ──────────────────────────────────────────
    def urlopen(self, req, timeout=None):
        url, metodo = req.full_url, req.get_method()
        if "/rest/v1/mensagens" in url:
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(url).query)
            if metodo == "GET":
                limite = int(q.get("limit", ["1000"])[0])
                pend = [{"id": l["id"], "midia_url": l["midia_url"]}
                        for l in sorted(self.linhas.values(), key=lambda l: l["id"])
                        if l["transcricao"] is None and l["midia_url"] is not None]
                return Resposta(json.dumps(pend[:limite]).encode())
            if metodo == "PATCH":
                i = int(q["id"][0].removeprefix("eq."))
                corpo = json.loads(req.data)
                with self.trava:
                    self.patches.append((i, corpo))
                    self.linhas[i].update(corpo)
                return Resposta(b"")
        if "/storage/v1/object/chat-midia" in url and metodo == "DELETE":
            self.apagados_storage += json.loads(req.data)["prefixes"]
            return Resposta(b"[]")
        raise AssertionError(f"chamada inesperada: {metodo} {url}")

    # ── download do áudio ────────────────────────────────────────────────
    def baixar(self, url, destino, cabecalhos=None):
        assert "/storage/v1/object/authenticated/chat-midia/" in url, url
        assert cabecalhos and cabecalhos["Authorization"].startswith("Bearer "), cabecalhos
        i = int(url.rsplit("/a", 1)[1].split(".")[0])
        with self.trava:
            self.downloads[i] = n = self.downloads.get(i, 0) + 1
        comp = self.comportamento.get(i, "ok")
        if comp == "403-sempre" or (comp == "403-uma-vez" and n == 1):
            raise urllib.error.HTTPError(url, 403, "Forbidden", None, io.BytesIO(b""))
        if comp == "corta-no-meio":
            # Como o `baixar` antigo fazia: abre o arquivo e a rede cai antes
            # de escrever — sobra 0 byte no disco.
            open(destino, "wb").close()
            raise TimeoutError("The read operation timed out")
        with open(destino, "wb") as f:
            f.write(b"\0" * (99 if comp == "99-bytes" else 5000))


def carregar_falso(caminho):
    """Áudio de 1 s; arquivo < 1 KB não decodifica, como no ffmpeg de verdade."""
    if os.path.getsize(caminho) < 1024:
        raise RuntimeError("ffmpeg: Invalid data found when processing input")
    return [0.0] * 16000


class DownloadQueFalhaNaoDerrubaARodada(unittest.TestCase):
    def test_403_no_meio_da_rodada(self):
        mod = carregar_script()
        mundo = Mundo([101, 102, 103, 104, 105, 106])
        mundo.comportamento = {
            102: "403-sempre",     # o caso de 27/11, mas sem passar
            103: "403-uma-vez",    # o caso de 27/11 como foi: passageiro
            104: "99-bytes",       # arquivo quebrado: regra antiga, intocada
            105: "corta-no-meio",  # meio arquivo não pode virar "quebrado"
        }
        pastas = []
        mkdtemp_real = tempfile.mkdtemp

        def mkdtemp(*a, **k):
            pastas.append(mkdtemp_real(*a, **k))
            return pastas[-1]

        saida = io.StringIO()
        # O que o script imprimiu aparece mesmo se ele cair (versão antiga).
        self.addCleanup(lambda: print(saida.getvalue()))
        with contextlib.ExitStack() as pilha:
            entra = pilha.enter_context
            entra(mock.patch.object(sys, "argv", ["transcrever-audios.py", "--empresa", "1"]))
            entra(mock.patch.object(mod, "env_local", lambda: {
                "NEXT_PUBLIC_SUPABASE_URL": BASE, "SUPABASE_SERVICE_ROLE_KEY": "chave-falsa"}))
            entra(mock.patch.object(mod, "baixar", mundo.baixar))
            entra(mock.patch.object(mod, "carregar", carregar_falso))
            entra(mock.patch.object(mod.urllib.request, "urlopen", mundo.urlopen))
            entra(mock.patch.object(mod.tempfile, "mkdtemp", mkdtemp))
            if hasattr(mod, "ESPERAS_DOWNLOAD"):
                entra(mock.patch.object(mod, "ESPERAS_DOWNLOAD", (0, 0)))
            entra(contextlib.redirect_stdout(saida))
            codigo = mod.main()

        # A rodada terminou (não houve traceback) e não declarou fracasso total.
        self.assertEqual(codigo, 0)

        # Os bons foram transcritos — inclusive o do 403 passageiro.
        for i in (101, 103, 106):
            self.assertEqual(mundo.linhas[i]["transcricao"], "quanto fica o iPhone 15 na troca?")
        self.assertEqual(mundo.downloads[103], 2, "o 403 passageiro passa na 2ª tentativa")

        # Quem não baixou: nenhuma gravação, link intacto — segue pendente.
        for i in (102, 105):
            self.assertEqual([c for j, c in mundo.patches if j == i], [], f"gravou algo para {i}")
            self.assertIsNone(mundo.linhas[i]["transcricao"])
            self.assertIsNotNone(mundo.linhas[i]["midia_url"])
            self.assertIn(f"[{i}] download falhou (3 tentativas)", saida.getvalue())
        self.assertNotIn("emp1/a105.ogg", mundo.apagados_storage,
                         "meio arquivo de download que caiu NÃO é 'arquivo quebrado'")

        # Arquivo quebrado (<1 KB) continua sendo descartado como antes.
        self.assertIsNone(mundo.linhas[104]["midia_url"])
        self.assertIsNone(mundo.linhas[104]["transcricao"])
        self.assertEqual(mundo.apagados_storage, ["emp1/a104.ogg"])

        # LEVA QUE NÃO GRAVA NADA É LAÇO INFINITO: a 2ª leva traz só 102 e
        # 105, nenhum grava, o script para e diz quais são.
        self.assertIn("PAREI", saida.getvalue())
        self.assertIn("Ids: 102, 105", saida.getvalue())
        self.assertEqual(mundo.downloads[102], 6, "3 tentativas em cada uma das 2 levas")
        self.assertIn("4 falhas", saida.getvalue())

        # Nada de áudio de cliente fica na máquina.
        self.assertTrue(pastas)
        for p in pastas:
            self.assertFalse(os.path.exists(p), f"pasta temporária ficou: {p}")


if __name__ == "__main__":
    unittest.main(verbosity=2)
