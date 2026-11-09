& {
  # =====================================================================================
  # DUMP ÚNICO da produção (crm-saas, guiuzbcqkvelqcuogxtd), cifrado com 7z (AES-256).
  #
  # Uso, na raiz do repositório, num PowerShell seu (as senhas são digitadas por você):
  #   powershell -ExecutionPolicy Bypass -File tools\banco\dump-unico.ps1
  #
  # Pede DUAS senhas, nenhuma é gravada em lugar nenhum:
  #   1. a do banco (uma vez; vale só para este processo e é apagada no fim);
  #   2. a do arquivo 7z (o 7-Zip pede ao criar; o script pede de novo no teste e refaz a cifra se não abrir).
  #
  # Rode com o IOwait da produção abaixo de 10% (painel Observability > Database > CPU usage).
  #
  # Saída em dumps\AAAA-MM-DD-unico\ (a pasta dumps\ está no .gitignore):
  #   nexus-AAAA-MM-DD.7z   os 5 arquivos abaixo, cifrados, com os nomes cifrados também (-mhe=on)
  #   SHA256.txt            hash do .7z
  #   _claro\               os mesmos 5 arquivos SEM cifra, só para a prova de restauração no
  #                         Supabase local (tools/banco/montar-local.sh). APAGAR depois da prova.
  #
  # Conteúdo (o mesmo desenho do backup de 16/10, docs/BACKUP-RESTAURACAO-20261016.md):
  #   projeto.dump                 estrutura e dados de public, migracao, ops, supabase_migrations
  #   auth-storage-estrutura.dump  só estrutura de auth e storage
  #   auth-storage-dados.dump      dados de auth.users, auth.identities e de storage (menos
  #                                storage.migrations). As demais tabelas de auth (sessões, tokens,
  #                                MFA, auditoria) ficam SEM dados, por decisão de 16/10.
  #   cron-jobs.dump               dados de cron.job
  #   papeis.sql                   papéis, sem senha
  # Não incluído: os arquivos do Storage (só os metadados), vault, segredos da Vercel/Edge.
  # =====================================================================================
  $ErrorActionPreference = 'Stop'
  $PG       = 'C:\Ferramentas\pgsql-18.4\bin'
  $RAIZ     = Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'dumps'
  $CA       = "$env:USERPROFILE\Downloads\prod-ca-2021.crt"
  $HOSTPOOL = 'aws-1-sa-east-1.pooler.supabase.com'
  $USUARIO  = 'postgres.guiuzbcqkvelqcuogxtd'

  foreach ($x in 'pg_dump.exe','pg_dumpall.exe','pg_restore.exe') {
    if (-not (Test-Path -LiteralPath "$PG\$x")) { Write-Host "Ferramenta ausente: $PG\$x. Nada foi feito." -ForegroundColor Red; return }
  }
  if (-not (Get-Command 7z -ErrorAction SilentlyContinue)) { Write-Host '7z não encontrado no PATH. Nada foi feito.' -ForegroundColor Red; return }
  if (-not (Test-Path -LiteralPath $CA -PathType Leaf)) { Write-Host "Certificado da CA não encontrado em $CA. Nada foi feito." -ForegroundColor Red; return }
  $CAlibpq = $CA -replace '\\', '/'
  $con = "host=$HOSTPOOL port=5432 dbname=postgres user=$USUARIO sslmode=verify-full sslrootcert='$CAlibpq' application_name=dump-unico connect_timeout=20"

  $dia   = (Get-Date).ToString('yyyy-MM-dd')
  $pasta = Join-Path $RAIZ "$dia-unico"
  $claro = Join-Path $pasta '_claro'
  $arq7z = Join-Path $pasta "nexus-$dia.7z"
  $esperados = 'projeto.dump','auth-storage-estrutura.dump','auth-storage-dados.dump','cron-jobs.dump','papeis.sql'
  # Dump de hoje já tirado e a cifra falhou: reaproveita o _claro (não pede a senha do banco).
  $reusar = (Test-Path -LiteralPath $claro) -and -not (Test-Path -LiteralPath $arq7z) -and
            @($esperados | Where-Object { Test-Path -LiteralPath (Join-Path $claro $_) }).Count -eq $esperados.Count
  if ($reusar) {
    $hora = (Get-Item -LiteralPath (Join-Path $claro 'projeto.dump')).LastWriteTime.ToString('HH:mm')
    Write-Host "Reaproveitando o dump de hoje às $hora em $claro (só a cifra será feita)." -ForegroundColor Yellow
  } elseif (Test-Path -LiteralPath $pasta) {
    Write-Host "Já existe $pasta. Apague ou renomeie e rode de novo. Nada foi feito." -ForegroundColor Yellow; return
  } else {
  New-Item -ItemType Directory -Path $claro -Force | Out-Null

  $seg = Read-Host -AsSecureString 'Senha do BANCO (não aparece na tela)'
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seg)
  try {
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    $comum  = @('-d', $con, '--lock-wait-timeout=60000')
    $passos = @(
      @{ arq = 'projeto.dump';                exe = 'pg_dump.exe';    a = $comum + @('-Fc','-Z','6','-n','public','-n','migracao','-n','ops','-n','supabase_migrations') },
      @{ arq = 'auth-storage-estrutura.dump'; exe = 'pg_dump.exe';    a = $comum + @('-Fc','-Z','6','--schema-only','-n','auth','-n','storage') },
      @{ arq = 'auth-storage-dados.dump';     exe = 'pg_dump.exe';    a = $comum + @('-Fc','-Z','6','--data-only','--strict-names','-t','auth.users','-t','auth.identities','-t','storage.*','-T','storage.migrations') },
      @{ arq = 'cron-jobs.dump';              exe = 'pg_dump.exe';    a = $comum + @('-Fc','--data-only','--strict-names','-t','cron.job') },
      @{ arq = 'papeis.sql';                  exe = 'pg_dumpall.exe'; a = @('-d', $con, '--roles-only', '--no-role-passwords') }
    )
    foreach ($p in $passos) {
      Write-Host ">>> $($p.arq)" -ForegroundColor Cyan
      $global:LASTEXITCODE = $null
      & (Join-Path $PG $p.exe) @($p.a + @('-f', (Join-Path $claro $p.arq)))
      if ($LASTEXITCODE -ne 0) { Write-Host "FALHOU em $($p.arq) (código $LASTEXITCODE). Parei; $pasta ficou para análise." -ForegroundColor Red; return }
    }
  } finally {
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
  }

  # Leitura completa de cada .dump (descompacta todos os blocos, não conecta em nada).
  foreach ($d in Get-ChildItem -LiteralPath $claro -Filter *.dump) {
    $global:LASTEXITCODE = $null
    & (Join-Path $PG 'pg_restore.exe') '-f' 'NUL' $d.FullName
    if ($LASTEXITCODE -ne 0) { Write-Host "Leitura completa falhou: $($d.Name). Parei." -ForegroundColor Red; return }
  }
  # Nenhum segredo nos papéis (só a contagem aparece).
  $sus = @(Select-String -LiteralPath (Join-Path $claro 'papeis.sql') -Pattern "PASSWORD\s+'", 'SCRAM-SHA-256\$', 'md5[0-9a-f]{32}')
  if ($sus.Count -gt 0) { Write-Host "papeis.sql com $($sus.Count) linha(s) de senha. Parei." -ForegroundColor Red; return }

  # O 7-Zip 26 pede a senha UMA vez ao criar (não confirma). A conferência é o teste logo em
  # seguida: se a senha do teste não abrir, o .7z é apagado e a cifra é refeita (o dump não).
  # ATENÇÃO: no teste vai SEM '-p'. '7z t -p' testa com senha VAZIA e não pergunta nada
  # (foi o que derrubou as tentativas de 09/11); sem '-p' ele pede a senha ao achar a cifra.
  $ok = $false
  for ($tentativa = 1; $tentativa -le 3 -and -not $ok; $tentativa++) {
    if (Test-Path -LiteralPath $arq7z) { Remove-Item -LiteralPath $arq7z -Force }
    Write-Host "`n>>> Cifrando (tentativa $tentativa de 3). Digite a senha do ARQUIVO." -ForegroundColor Cyan
    $global:LASTEXITCODE = $null
    & 7z a -t7z -mx=5 -mhe=on -p $arq7z (Join-Path $claro '*')
    if ($LASTEXITCODE -ne 0) { Write-Host '7z falhou ao criar. Parei.' -ForegroundColor Red; return }
    Write-Host "`n>>> Conferindo: digite a MESMA senha do arquivo de novo." -ForegroundColor Cyan
    $global:LASTEXITCODE = $null
    & 7z t $arq7z
    if ($LASTEXITCODE -eq 0) { $ok = $true } else { Write-Host 'A senha da conferência não abriu o arquivo. Vou cifrar de novo.' -ForegroundColor Yellow }
  }
  if (-not $ok) { Remove-Item -LiteralPath $arq7z -Force -ErrorAction SilentlyContinue; Write-Host 'Três tentativas sem conferir. Parei; o .7z foi apagado e _claro ficou.' -ForegroundColor Red; return }

  $h = Get-FileHash -Algorithm SHA256 -LiteralPath $arq7z
  '{0}  {1}  {2} bytes' -f $h.Hash, (Split-Path $arq7z -Leaf), (Get-Item -LiteralPath $arq7z).Length | Set-Content -LiteralPath (Join-Path $pasta 'SHA256.txt') -Encoding ascii
  Write-Host "`nPronto: $arq7z" -ForegroundColor Green
  Get-ChildItem -LiteralPath $claro | ForEach-Object { '  {0,-30} {1,12:N0} bytes' -f $_.Name, $_.Length } | Out-Host
  Write-Host 'Avise o Claude: ele faz a prova de restauração no Supabase local e depois apaga a pasta _claro.' -ForegroundColor Green
}
