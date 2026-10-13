"""
TRANSCREVE OS ÁUDIOS DO WHATSAPP, NA MÁQUINA, DE GRAÇA.

    python scripts/transcrever-audios.py                 (tudo que falta)
    python scripts/transcrever-audios.py --limite 50     (uma prova menor)
    python scripts/transcrever-audios.py --empresa 1

══ POR QUE LOCAL, E NÃO NA NUVEM ══════════════════════════════════════════

Duas razões, medidas em 13/10/2026:

  1. **LGPD.** Isto é voz de cliente — nome, telefone, às vezes CPF dito em
     voz alta. No tier gratuito do Gemini a tabela oficial de preços diz
     "Used to improve our products: Yes". Aqui nada sai da máquina.
  2. **Custo zero**, e mais rápido que o estimado: medido em **24,1× tempo
     real** numa RTX 2060. As ~61 h de áudio da JM saem em ~2,5 h.

══ O QUE INSTALAR (uma vez) ═══════════════════════════════════════════════

    python -m venv .venv-whisper
    .venv-whisper\\Scripts\\pip install faster-whisper --no-deps
    .venv-whisper\\Scripts\\pip install ctranslate2 tokenizers huggingface_hub \\
        numpy soundfile cffi scipy onnxruntime \\
        nvidia-cublas-cu12 "nvidia-cudnn-cu12==9.*"

⚠ `faster-whisper` com `--no-deps` de propósito: a dependência `av` (PyAV)
**não compila no Python 3.14** — falha em `Cython ... av/logging.pyx`. Quem lê
o áudio aqui é `soundfile`; o que ele não abre vai pelo ffmpeg.

⚠ Sem `nvidia-cublas-cu12` e `nvidia-cudnn-cu12`, o ctranslate2 morre com
`RuntimeError: Library cublas64_12.dll is not found`. Essas DLLs vêm do pip,
não do sistema, e precisam entrar no PATH ANTES do import — é o que
`_preparar_cuda()` faz logo abaixo.

⚠ FFMPEG é obrigatório para 8% dos arquivos: `soundfile` lê ogg/opus, mas não
os containers MPEG (14 `.m4a` e ~951 mensagens de voz que o WhatsApp entrega
como `video/mp4`). Basta um ffmpeg avulso no PATH.
"""
import argparse
import os
import subprocess
import sys
import tempfile
import time
import urllib.request


def _preparar_cuda() -> None:
    """Põe as DLLs da CUDA (pacotes `nvidia-*` do pip) ao alcance do loader."""
    import site
    for sp in [*site.getsitepackages(), site.getusersitepackages()]:
        base = os.path.join(sp, "nvidia")
        if not os.path.isdir(base):
            continue
        for pasta, _, arquivos in os.walk(base):
            if any(a.endswith(".dll") for a in arquivos):
                try:
                    os.add_dll_directory(pasta)
                except OSError:
                    pass
                os.environ["PATH"] = pasta + os.pathsep + os.environ.get("PATH", "")


_preparar_cuda()

from faster_whisper import WhisperModel  # noqa: E402
import soundfile as sf                   # noqa: E402
from scipy.signal import resample_poly   # noqa: E402
from math import gcd                     # noqa: E402

TAXA = 16000

# ══ VOCABULÁRIO: SÓ NOME PRÓPRIO, NUNCA PRODUTO ═══════════════════════════
#
# Medido em 13/10/2026, comparando o mesmo áudio com e sem esta dica:
#
#   MELHOROU  "Mojo Mirim"      ->  "Mogi Mirim"             ✅
#   PIOROU    "92 de bateria"   ->  "92GB de bateria"        ❌  (é 92% de SAÚDE)
#   PIOROU    "a iPhone 17?"    ->  "a iPhone 17, o Pro Max" ❌  INVENTOU o modelo
#
# Listar capacidades fez o modelo enfiar "GB" onde não havia; listar modelos
# fez ele acrescentar um aparelho que ninguém falou. Alucinação induzida é
# pior que o erro original — "Mojo Mirim" qualquer um entende, "o Pro Max"
# inventado vira negociação que não existiu.
#
# Por isso aqui entra SÓ topônimo e o nome da loja.
VOCABULARIO = (
    "Conversa de WhatsApp de uma loja em Mogi Guaçu, São Paulo. "
    "Também atende Mogi Mirim, Itapira, Jaguariúna e Estiva Gerbi."
)

# O Whisper preenche silêncio com frase feita. Estas apareceram no teste e em
# trechos sem fala nenhuma; viram transcrição vazia em vez de invenção.
RUIDO = {
    "um beijo para você", "obrigado", "obrigada", "tchau", "legendas pela comunidade amara.org",
    "legendado por", "inscreva-se no canal", "até o próximo vídeo", "música",
}


def baixar(url: str, destino: str) -> None:
    with urllib.request.urlopen(url, timeout=60) as r, open(destino, "wb") as f:
        f.write(r.read())


def carregar(caminho: str):
    """16 kHz mono. `soundfile` resolve ogg/opus; o resto vai pelo ffmpeg."""
    try:
        dados, sr = sf.read(caminho, dtype="float32", always_2d=True)
    except Exception:
        wav = caminho + ".wav"
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", caminho,
             "-ar", str(TAXA), "-ac", "1", "-f", "wav", wav],
            check=True,
        )
        dados, sr = sf.read(wav, dtype="float32", always_2d=True)
        os.unlink(wav)

    mono = dados.mean(axis=1)
    if sr != TAXA:
        g = gcd(int(sr), TAXA)
        mono = resample_poly(mono, TAXA // g, int(sr) // g).astype("float32")
    return mono


def limpar(texto: str) -> str:
    """Tira a frase-feita que o modelo inventa no silêncio."""
    t = texto.strip()
    return "" if t.lower().strip(" .!?") in RUIDO else t


def env_local() -> dict:
    caminho = os.path.join(os.path.dirname(__file__), "..", ".env.local")
    saida = {}
    with open(caminho, encoding="utf-8") as f:
        for linha in f:
            if "=" in linha and not linha.strip().startswith("#"):
                i = linha.index("=")
                saida[linha[:i].strip()] = linha[i + 1:].strip().strip("\"'")
    return saida


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--empresa", type=int, default=None)
    p.add_argument("--limite", type=int, default=None)
    p.add_argument("--modelo", default="large-v3-turbo")
    args = p.parse_args()

    env = env_local()
    url_base = env["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
    chave = env["SUPABASE_SERVICE_ROLE_KEY"]
    cab = {"apikey": chave, "Authorization": f"Bearer {chave}",
           "Content-Type": "application/json"}

    import json

    def rest(metodo: str, caminho: str, corpo=None, extra=None):
        req = urllib.request.Request(
            f"{url_base}/rest/v1/{caminho}", method=metodo,
            data=json.dumps(corpo).encode() if corpo is not None else None,
            headers={**cab, **(extra or {})},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            bruto = r.read()
            return json.loads(bruto) if bruto else None

    # O índice `idx_lead_mensagens_audio_pendente` existe exatamente para esta
    # consulta — alguém já tinha desenhado este trabalho antes, junto com a
    # coluna `transcricao`, e nunca o escreveu.
    filtro = ("lead_mensagens?select=id,midia_url&tipo=eq.audio"
              "&transcricao=is.null&midia_url=not.is.null&order=id.asc")
    if args.empresa:
        filtro += f"&empresa_id=eq.{args.empresa}"
    filtro += f"&limit={args.limite or 100000}"

    pendentes = rest("GET", filtro)
    print(f"\naudios sem transcricao: {len(pendentes)}")
    if not pendentes:
        return 0

    print(f"carregando {args.modelo} na GPU...")
    modelo = WhisperModel(args.modelo, device="cuda", compute_type="float16")

    feitos = vazios = falhas = 0
    seg_audio = 0.0
    t_inicio = time.time()
    tmp = tempfile.mkdtemp(prefix="transcr-")

    for n, linha in enumerate(pendentes, 1):
        destino = os.path.join(tmp, f"a{linha['id']}")
        try:
            baixar(linha["midia_url"], destino)
            audio = carregar(destino)
            seg_audio += len(audio) / TAXA

            partes, _ = modelo.transcribe(
                audio, language="pt", beam_size=5, vad_filter=True,
                condition_on_previous_text=False, initial_prompt=VOCABULARIO,
            )
            texto = limpar(" ".join(s.text.strip() for s in partes))

            # Áudio sem fala vira string vazia, NÃO fica nulo: nulo significa
            # "ainda não tentei", e o script rodaria nele para sempre.
            rest("PATCH", f"lead_mensagens?id=eq.{linha['id']}",
                 {"transcricao": texto}, {"Prefer": "return=minimal"})
            if texto:
                feitos += 1
            else:
                vazios += 1
        except Exception as e:
            falhas += 1
            print(f"  [{linha['id']}] {type(e).__name__}: {str(e)[:70]}")
        finally:
            for f in (destino, destino + ".wav"):
                if os.path.exists(f):
                    os.unlink(f)

        if n % 100 == 0 or n == len(pendentes):
            gasto = time.time() - t_inicio
            vel = seg_audio / gasto if gasto else 0
            resta = (len(pendentes) - n) * (gasto / n) / 60
            print(f"  {n}/{len(pendentes)}  {feitos} com texto, {vazios} sem fala, "
                  f"{falhas} falhas  ({vel:.1f}x tempo real, faltam ~{resta:.0f} min)")

    gasto = time.time() - t_inicio
    print(f"\n{feitos} transcritos, {vazios} sem fala, {falhas} falhas")
    print(f"{seg_audio/3600:.1f} h de audio em {gasto/60:.0f} min "
          f"=> {seg_audio/gasto:.1f}x tempo real\n")
    return 1 if falhas and not feitos else 0


if __name__ == "__main__":
    sys.exit(main())
