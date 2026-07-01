<#
.SYNOPSIS
  Read-only security smoke test for the Rozumko backend (docs/smoke-test.md §7-8).

.DESCRIPTION
  Runs a small, safe set of unauthenticated checks against a live backend and
  asserts the expected HTTP status codes / response shape. Designed to be run
  after every deploy and before each event.

  By default it does NOT run the rate-limit probe (that one sends ~25 requests
  and would otherwise spam production). Pass -IncludeRateLimit to include it.

.PARAMETER BaseUrl
  Backend origin. Defaults to the Render production URL.

.PARAMETER IncludeRateLimit
  Also run the rate-limit / X-Forwarded-For spoofing probe (~50 requests total).

.EXAMPLE
  pwsh ./scripts/smoke-security.ps1
  pwsh ./scripts/smoke-security.ps1 -BaseUrl http://localhost:3000 -IncludeRateLimit
#>
[CmdletBinding()]
param(
  [string]$BaseUrl = 'https://rozumko-github-io.onrender.com',
  [switch]$IncludeRateLimit
)

$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')

$script:Pass = 0
$script:Fail = 0

# ── HTTP helper: returns status + body without throwing on 4xx/5xx ────────────
function Get-Status {
  param(
    [string]$Method = 'GET',
    [Parameter(Mandatory)][string]$Url,
    [hashtable]$Headers,
    [string]$Body
  )
  try {
    $p = @{ Method = $Method; Uri = $Url; UseBasicParsing = $true; TimeoutSec = 25 }
    if ($Headers) { $p.Headers = $Headers }
    if ($PSBoundParameters.ContainsKey('Body')) { $p.Body = $Body; $p.ContentType = 'application/json' }
    $r = Invoke-WebRequest @p
    return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = [string]$r.Content }
  } catch {
    $resp = $_.Exception.Response
    if ($resp) {
      $code = 0
      try { $code = [int]$resp.StatusCode } catch {}
      $body = ''
      try {
        $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
        $body = $reader.ReadToEnd()
      } catch {}
      return [pscustomobject]@{ Status = $code; Body = $body }
    }
    return [pscustomobject]@{ Status = 0; Body = $_.Exception.Message }
  }
}

# ── Assertion reporter ────────────────────────────────────────────────────────
function Report {
  param([string]$Name, [bool]$Ok, [string]$Detail)
  if ($Ok) {
    $script:Pass++
    Write-Host ('  [PASS] ' + $Name) -ForegroundColor Green
  } else {
    $script:Fail++
    Write-Host ('  [FAIL] ' + $Name + '  -> ' + $Detail) -ForegroundColor Red
  }
}

function Check-Status {
  param([string]$Name, [int[]]$Expect, [string]$Method = 'GET', [string]$Path, [hashtable]$Headers, [string]$Body)
  $req = @{ Method = $Method; Url = ($BaseUrl + $Path) }
  if ($Headers) { $req.Headers = $Headers }
  if ($PSBoundParameters.ContainsKey('Body')) { $req.Body = $Body }
  $res = Get-Status @req
  $ok = $Expect -contains $res.Status
  Report -Name $Name -Ok $ok -Detail ("expected {0}, got {1}" -f ($Expect -join '/'), $res.Status)
  return $res
}

Write-Host ''
Write-Host ('Rozumko security smoke test -> ' + $BaseUrl) -ForegroundColor Cyan
Write-Host ''

# ── §1 Readiness ──────────────────────────────────────────────────────────────
Write-Host 'Readiness' -ForegroundColor Yellow
$r = Check-Status -Name 'GET /ready returns 200'      -Expect 200 -Path '/ready'
Report -Name 'GET /ready reports db ok' -Ok ($r.Body -match '"db"\s*:\s*"ok"') -Detail $r.Body

# ── §7 Public question endpoint ───────────────────────────────────────────────
Write-Host ''
Write-Host 'Public /api/questions guards' -ForegroundColor Yellow
Check-Status -Name 'isOlympiad=true is rejected (400)'      -Expect 400 -Path '/api/questions?isOlympiad=true' | Out-Null
Check-Status -Name 'count=abc rejected (400)'               -Expect 400 -Path '/api/questions?count=abc'      | Out-Null
Check-Status -Name 'count=-5 rejected (400)'                -Expect 400 -Path '/api/questions?count=-5'       | Out-Null
Check-Status -Name 'count=0 rejected (400)'                 -Expect 400 -Path '/api/questions?count=0'        | Out-Null
Check-Status -Name 'count=999 rejected (400)'               -Expect 400 -Path '/api/questions?count=999'      | Out-Null

$practice = Check-Status -Name 'practice list returns 200'  -Expect 200 -Path '/api/questions?isOlympiad=false&grade=4&count=5'
$demo = Check-Status -Name 'demo (hideAnswers) returns 200' -Expect 200 -Path '/api/questions?isOlympiad=false&grade=4&count=5&hideAnswers=true'
$leak = $demo.Body -match '"(correct|correctOrder|pairs|answer)"\s*:'
Report -Name 'demo response strips all answer keys' -Ok (-not $leak) -Detail 'answer key found in hideAnswers=true response'

# ── §7 Auth / token guards ────────────────────────────────────────────────────
Write-Host ''
Write-Host 'Auth and token guards' -ForegroundColor Yellow
# Malformed :id is rejected by schema (uuid format) before any DB access.
$deadBody = '{"questionId":"11111111-1111-1111-1111-111111111111","answer":0}'
Check-Status -Name 'answer with non-uuid :id rejected (400)' -Expect 400 -Method 'POST' -Path '/api/attempt/not-a-uuid/answer' -Body $deadBody | Out-Null
# Well-formed but unknown attempt id, no token -> 404 (attempt lookup) or 403 (token). Never 200.
Check-Status -Name 'answer without X-Attempt-Token is not accepted (403/404)' -Expect @(403,404) -Method 'POST' -Path '/api/attempt/11111111-1111-1111-1111-111111111111/answer' -Body $deadBody | Out-Null
Check-Status -Name 'admin stats without auth (401)'   -Expect 401 -Path '/api/admin/stats'    | Out-Null
Check-Status -Name 'teacher me without auth (401)'    -Expect 401 -Path '/api/teacher/me'     | Out-Null
Check-Status -Name 'admin route with bad uuid (400)'  -Expect @(400,401) -Method 'PUT' -Path '/api/admin/teachers/not-a-uuid/status' -Body '{"status":"active"}' | Out-Null

# ── §8 Rate limiting (opt-in) ─────────────────────────────────────────────────
if ($IncludeRateLimit) {
  Write-Host ''
  Write-Host 'Rate limiting probe (opt-in)' -ForegroundColor Yellow
  Write-Warning 'This sends ~50 requests to the live backend. Run only against staging or off-peak.'
  Write-Host '  Sending up to 25 requests with a FIXED X-Forwarded-For...'
  $hit429 = $false
  for ($i = 0; $i -lt 25; $i++) {
    $res = Get-Status -Url ($BaseUrl + '/api/student/validate-code?code=ZZZZ9999') -Headers @{ 'X-Forwarded-For' = '203.0.113.7' }
    if ($res.Status -eq 429) { $hit429 = $true; break }
  }
  Report -Name 'fixed X-Forwarded-For eventually hits 429' -Ok $hit429 -Detail 'no 429 seen in 25 requests'

  Write-Host '  Sending up to 25 requests with a ROTATING X-Forwarded-For...'
  $hit429b = $false
  for ($i = 0; $i -lt 25; $i++) {
    $res = Get-Status -Url ($BaseUrl + '/api/student/validate-code?code=ZZZZ9999') -Headers @{ 'X-Forwarded-For' = ("198.51.100." + $i) }
    if ($res.Status -eq 429) { $hit429b = $true; break }
  }
  # trustProxy:1 -> spoofed XFF must NOT create a fresh bucket, so 429 still appears.
  Report -Name 'rotating X-Forwarded-For still hits 429 (no bucket bypass)' -Ok $hit429b -Detail 'rotating XFF bypassed the limiter'
} else {
  Write-Host ''
  Write-Host 'Rate-limit probe skipped. Re-run with -IncludeRateLimit to include it.' -ForegroundColor DarkGray
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host ('Result: ' + $script:Pass + ' passed, ' + $script:Fail + ' failed.') -ForegroundColor Cyan
Write-Host ''
if ($script:Fail -gt 0) { exit 1 } else { exit 0 }
